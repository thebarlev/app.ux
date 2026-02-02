import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generatePreviewPDF } from "@/lib/pdf-service"
import { isPdfDebugEnabled, logPdfEvent } from "@/lib/pdf-logger"

/**
 * Format download filename:
 * - original: <documentNumber>.pdf
 * - copy: <documentNumber>-<lang>.pdf
 */
function formatDownloadFilename(
  documentNumber: string | null,
  documentId: string,
  language: "he" | "en",
  issue: "original" | "copy"
): string {
  const lang = language === "he" ? "he" : "en"
  const base = (documentNumber || documentId).toString().trim() || documentId
  return issue === "original" ? `${base}.pdf` : `${base}-${lang}.pdf`
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
  const requestId = randomUUID()
  const pdfDebugEnabled = isPdfDebugEnabled()

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

    if (pdfDebugEnabled) {
      console.log("[PDF] Start:", { documentId, userId: auth.user.id })
    }

    // 2) Fetch document metadata (using userClient - RLS applies)
    const { data: doc, error: docError } = await userClient
      .from("documents")
      .select(
        "id, document_type, document_status, document_number, company_id, language, template_version_id, finalized_at, pdf_storage_key, pdf_storage_key_he_copy, pdf_storage_key_en"
      )
      .eq("id", documentId)
      .single()

    if (docError || !doc) {
      console.error("[PDF] Document lookup failed:", { docError, documentId })
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Allow draft previews; finalized/pdf_ready serve immutable stored PDFs.
    // NOTE: cancelled documents must remain downloadable (original PDF is immutable).
    const allowedByStatus =
      doc.document_status === "final" ||
      doc.document_status === "pdf_ready" ||
      doc.document_status === "draft" ||
      doc.document_status === "cancelled"
    if (!allowedByStatus) {
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

    let effectiveIssue: "original" | "copy" = issueMode
    const isOriginalAllowed = issueMode === "original" && targetLanguage === "he"
    let originalAlreadyIssued = !!(doc as any)?.original_issued_at

    if (isOriginalAllowed) {
      const { data: originalEvents, error: originalEventError } = await adminClient
        .from("document_events")
        .select("id")
        .eq("document_id", documentId)
        .eq("event_type", "original_issued")
        .limit(1)
      if (!originalEventError && originalEvents && originalEvents.length > 0) {
        originalAlreadyIssued = true
      }
      effectiveIssue = originalAlreadyIssued ? "copy" : "original"
    }
    const documentCopyLabel =
      effectiveIssue === "original"
        ? "מקור"
        : targetLanguage === "en"
          ? "Faithful Copy"
          : "העתק נאמן למקור"

    if (pdfDebugEnabled) {
      console.info("[PDF ISSUANCE]", {
        documentId,
        issue: effectiveIssue,
        lang: targetLanguage,
        isOriginalAllowed,
        label: documentCopyLabel,
      })
    }

    // Regulatory: originals must be Hebrew-only.
    if (effectiveIssue === "original" && targetLanguage !== "he") {
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
      const preview = await generatePreviewPDF(documentId, { language: targetLanguage, requestId, context: "preview" })
      if (!preview.success || !preview.buffer) {
        return NextResponse.json(
          { error: preview.error || "Failed to generate preview PDF", code: "PDF_PREVIEW_FAILED" },
          { status: 500 }
        )
      }
      const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage, effectiveIssue)
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

    // Final/pdf_ready/cancelled: must serve the SIGNED PDF only (no regeneration).
    const storageBucket = "business-assets"
    const storageKey =
      targetLanguage === "he"
        ? effectiveIssue === "original"
          ? ((doc as any).pdf_storage_key as string | null)
          : ((doc as any).pdf_storage_key_he_copy as string | null)
        : ((doc as any).pdf_storage_key_en as string | null)

    if (!storageKey) {
      return NextResponse.json(
        {
          error: "SIGNED_PDF_MISSING",
          message: "Signed PDF is missing for this document. Please contact support.",
        },
        { status: 500 }
      )
    }

    // Download directly from storage (no signed URL roundtrip).
    const { data: pdfBlob, error: downloadError } = await adminClient.storage
      .from(storageBucket)
      .download(storageKey)

    if (!pdfBlob) {
      logPdfEvent("core", "PDF_MISSING_BUT_EXPECTED", {
        docId: documentId,
        requestId,
        context: "download",
        lang: targetLanguage,
        result: "MISSING",
        bucket: storageBucket,
        fullPath: storageKey,
        timingMs: Date.now() - startedAt,
        source: "pdf-route",
        businessId: doc.company_id,
        userId: auth.user.id,
      })
      return NextResponse.json(
        {
          error: "SIGNED_PDF_MISSING",
          code: "SIGNED_PDF_MISSING",
          details: "Signed PDF missing in storage. No regeneration is allowed.",
        },
        { status: 500 }
      )
    }

    const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage, effectiveIssue)

    // MANDATORY: Audit logging (logical differentiation only - same PDF for both)
    try {
      if (effectiveIssue === "original") {
        const { data: existing } = await adminClient
          .from("documents")
          .select("original_issued_at")
          .eq("id", documentId)
          .single()

        if (!existing?.original_issued_at && !originalAlreadyIssued) {
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

    if (pdfDebugEnabled) {
      console.info("[PDF] mode=original", {
        documentId: documentId.substring(0, 8),
        generated: false,
        stored: true,
        storageKey,
        targetLanguage,
      })
    }
    logPdfEvent("core", "PDF_RETURNED_STORED", {
      docId: documentId,
      requestId,
      context: "download",
      lang: targetLanguage,
      result: "RETURNED_STORED",
      bucket: storageBucket,
      fullPath: storageKey,
      sizeBytes: pdfBlob.size,
      timingMs: Date.now() - startedAt,
      source: "pdf-route",
      businessId: doc.company_id,
      userId: auth.user.id,
    })


    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBlob.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Document-Issuance': effectiveIssue,
      },
    })
  } catch (e: any) {
    console.error("[PDF] Route crashed:", e?.stack || e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
