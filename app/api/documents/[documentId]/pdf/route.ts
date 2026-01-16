import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateDocumentPDF, generatePreviewPDF } from "@/lib/pdf-service"

/**
 * Sanitize document number to ASCII-safe characters (digits, letters, hyphen only)
 * and format download filename as: <documentNumber>-<lang>.pdf
 */
function formatDownloadFilename(documentNumber: string | null, documentId: string, language: "he" | "en"): string {
  const lang = language === "he" ? "he" : "en"
  
  if (documentNumber) {
    // Sanitize: keep only digits, letters, and hyphens
    const sanitized = documentNumber.replace(/[^0-9A-Za-z-]/g, "")
    if (sanitized.length > 0) {
      return `${sanitized}-${lang}.pdf`
    }
  }
  
  // Fallback to documentId if documentNumber is missing or empty after sanitization
  return `${documentId}-${lang}.pdf`
}

/**
 * API Route: Download PDF for a finalized document
 * GET /api/documents/[documentId]/pdf
 * 
 * ONE SOURCE OF TRUTH: Server-side only PDF generation and storage.
 * 
 * Uses two Supabase clients:
 * - userClient: Only for authentication (auth.getUser())
 * - adminClient: For all storage operations (createSignedUrl, generateDocumentPDF)
 * 
 * Flow:
 * 1. Authenticate user with userClient
 * 2. Fetch document metadata with userClient (RLS applies)
 * 3. If pdf_storage_key exists: Create signed URL with adminClient (bypasses RLS)
 * 4. If pdf_storage_key missing: Generate PDF with adminClient (idempotent fallback)
 * 5. Return signed URL redirect
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const startedAt = Date.now()

  try {
    // Create two clients: userClient for auth, adminClient for storage operations
    const userClient = await createClient()
    let adminClient: ReturnType<typeof createAdminClient>
    
    try {
      adminClient = createAdminClient()
    } catch (adminError: any) {
      // If admin client creation fails, it means env variables are missing
      console.error("[PDF API] Failed to create admin client:", adminError.message)
      return NextResponse.json(
        {
          error: "Server configuration error",
          code: "MISSING_ENV_VARIABLES",
          details: adminError.message || "Missing required environment variables for admin client. Please check your .env.local file and restart the server.",
        },
        { status: 500 }
      )
    }

    // 1) אימות משתמש (using userClient only)
    const { data: auth, error: authError } = await userClient.auth.getUser()
    
    if (authError || !auth?.user) {
      console.error("[PDF] Unauthorized:", { authError, documentId: (await params).documentId })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { documentId } = await params
    const requestUrl = new URL(req.url)
    const requestedLangParam = requestUrl.searchParams.get("lang")
    const requestedLanguage = requestedLangParam === "en" ? "en" : requestedLangParam === "he" ? "he" : null

    console.log("[PDF] Start:", { documentId, userId: auth.user.id })

    // 2) Fetch document metadata (using userClient - RLS applies)
    const { data: doc, error: docError } = await userClient
      .from("documents")
      .select("id, document_type, document_status, document_number, pdf_storage_key, company_id, language, template_version_id, original_recovery_attempted_at, finalized_at")
      .eq("id", documentId)
      .single()

    if (docError || !doc) {
      console.error("[PDF] Document lookup failed:", { docError, documentId })
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Allow draft previews; finalized/pdf_ready serve immutable stored PDFs.
    if (doc.document_status !== "final" && doc.document_status !== "pdf_ready" && doc.document_status !== "draft") {
      return NextResponse.json(
        { error: "PDF can only be downloaded for finalized documents" },
        { status: 400 }
      )
    }

    const docLanguage = ((doc as any)?.language as "he" | "en" | undefined) || "he"
    const issueMode: "original" | "copy" =
      requestUrl.searchParams.get("issue") === "original" ? "original" : "copy"
    const targetLanguage: "he" | "en" =
      requestedLanguage || (issueMode === "original" ? "he" : docLanguage)

    const isOriginalAllowed = issueMode === "original" && targetLanguage === "he"
    const documentCopyLabel =
      issueMode === "original"
        ? "מקור"
        : targetLanguage === "en"
          ? "Certified Copy"
          : "העתק נאמן למקור"

    console.info("[PDF ISSUANCE]", {
      documentId,
      issue: issueMode,
      lang: targetLanguage,
      isOriginalAllowed,
      label: documentCopyLabel,
    })

    // Regulatory: originals must be Hebrew-only.
    if (issueMode === "original" && targetLanguage !== "he") {
      return NextResponse.json(
        {
          error: "ORIGINAL_MUST_BE_HE",
          message: "מסמך מקור חייב להיות בעברית לפי הוראות ניהול ספרים",
          allowedAlternatives: ["/pdf?issue=original&lang=he", "/pdf?issue=copy&lang=en"],
        },
        { status: 400 }
      )
    }

    // Draft: preview only (no storage, no signing)
    if (doc.document_status === "draft") {
      const preview = await generatePreviewPDF(documentId, { language: targetLanguage })
      if (!preview.success || !preview.buffer) {
        return NextResponse.json(
          { error: preview.error || "Failed to generate preview PDF", code: "PDF_PREVIEW_FAILED" },
          { status: 500 }
        )
      }
      const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage)
      const body = (preview.buffer as any).buffer
        ? (preview.buffer as any).buffer.slice(
            (preview.buffer as any).byteOffset || 0,
            ((preview.buffer as any).byteOffset || 0) + (preview.buffer as any).byteLength
          )
        : preview.buffer
      return new NextResponse(body as any, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': preview.buffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // MANDATORY: All downloads (original/copy) return the SAME stored PDF
    // No PDF regeneration is allowed - single immutable PDF per document per language
    // PDFs were created once during finalization and stored - we only serve them
    // Final/pdf_ready: serve immutable stored PDF based on targetLanguage (he/en)
    const storageKey = `documents/${documentId}/source.${targetLanguage}.pdf`

    // Signed URL for stored PDF
    const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
      .from("business-assets")
      .createSignedUrl(storageKey, 120)

    const fetchFromSignedUrl = async (url: string) => {
      const pdfResponse = await fetch(url)
      if (!pdfResponse.ok) return null
      const blob = await pdfResponse.blob()
      return blob.size > 0 ? blob : null
    }

    // If signed URL failed or fetch failed -> treat as missing file
    let pdfBlob = signedUrlData?.signedUrl ? await fetchFromSignedUrl(signedUrlData.signedUrl) : null

    if (!pdfBlob) {
      // If English PDF is missing, return error (don't generate)
      if (targetLanguage === "en") {
        return NextResponse.json({
          error: "PDF_EN_MISSING",
          message: "English PDF not found. Please contact support.",
        }, { status: 404 })
      }

      const alreadyTriedRecovery = !!(doc as any).original_recovery_attempted_at
      // Regulatory: original is Hebrew-only; if it's missing we allow one-time recovery.

      if (alreadyTriedRecovery) {
        return NextResponse.json(
          {
            error: "Original PDF missing in storage and recovery already attempted.",
            code: "PDF_ORIGINAL_MISSING",
            details: "Please contact support. The system will not regenerate finalized originals repeatedly.",
          },
          { status: 500 }
        )
      }

      // Mark recovery attempt (admin bypasses RLS)
      await adminClient
        .from("documents")
        .update({ original_recovery_attempted_at: new Date().toISOString() })
        .eq("id", documentId)

      // Recovery generation (signed) - only for Hebrew, only if missing
      const recovered = await generateDocumentPDF(documentId, { language: targetLanguage, mode: "recovery" })
      if (!recovered.success || !recovered.buffer) {
        return NextResponse.json(
          { error: recovered.error || "Failed to recover PDF", code: "PDF_RECOVERY_FAILED" },
          { status: 500 }
        )
      }

      // Best-effort audit event
      try {
        await adminClient.from("document_events").insert({
          document_id: documentId,
          company_id: doc.company_id,
          event_type: "pdf_recovered",
          performed_by: auth.user.id,
          event_data: { storageKey },
        })
      } catch {
        // ignore
      }

      const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage)
      const body = (recovered.buffer as any).buffer
        ? (recovered.buffer as any).buffer.slice(
            (recovered.buffer as any).byteOffset || 0,
            ((recovered.buffer as any).byteOffset || 0) + (recovered.buffer as any).byteLength
          )
        : recovered.buffer
      return new NextResponse(body as any, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": recovered.buffer.length.toString(),
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Document-Issuance": "original",
        },
      })
    }

    const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage)

    // MANDATORY: Audit logging (logical differentiation only - same PDF for both)
    try {
      if (issueMode === "original") {
        const { data: existing } = await adminClient
          .from("documents")
          .select("original_issued_at")
          .eq("id", documentId)
          .single()

        if (!existing?.original_issued_at) {
          // Resolve recipient identifier from customer fields (best-effort)
          let recipientIdentifier: string | null = null
          const { data: customer } = await adminClient
            .from("documents")
            .select("customer_id, customer_tax_id")
            .eq("id", documentId)
            .single()

          if (customer?.customer_id) {
            const { data: c } = await adminClient
              .from("customers")
              .select("email, phone, mobile, tax_id")
              .eq("id", customer.customer_id)
              .maybeSingle()
            recipientIdentifier = (c?.email || c?.phone || c?.mobile || c?.tax_id || "").trim() || null
          }
          if (!recipientIdentifier) {
            recipientIdentifier = (customer as any)?.customer_tax_id || null
          }

          const nowIso = new Date().toISOString()
          await adminClient
            .from("documents")
            .update({
              original_issued_at: nowIso,
              original_issued_language: targetLanguage,
              original_issued_to_recipient_identifier: recipientIdentifier,
            })
            .eq("id", documentId)

          await adminClient.from("document_events").insert({
            document_id: documentId,
            company_id: doc.company_id,
            event_type: "original_issued",
            performed_by: auth.user.id,
            event_data: { recipient_identifier: recipientIdentifier, language: targetLanguage },
          })
        }
      } else {
        // Copy download - same PDF as original, logical distinction in audit log only
        await adminClient.from("document_events").insert({
          document_id: documentId,
          company_id: doc.company_id,
          event_type: "copy_downloaded",
          performed_by: auth.user.id,
          event_data: { language: targetLanguage },
        })
      }
    } catch {
      // ignore
    }

    console.info("[PDF] mode=original", {
      documentId: documentId.substring(0, 8),
      generated: false,
      stored: true,
      storageKey,
      targetLanguage,
    })

    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBlob.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Document-Issuance': issueMode,
      },
    })
  } catch (e: any) {
    console.error("[PDF] Route crashed:", e?.stack || e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
