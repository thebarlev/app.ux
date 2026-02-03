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

    // No-storage policy: signed PDFs are NOT persisted.
    // Therefore, this route cannot serve finalized documents.
    return NextResponse.json(
      {
        error: "NO_STORAGE_POLICY",
        message:
          "Signed PDF is not stored. Download is available only immediately after finalize/issue.",
      },
      { status: 410 }
    )
  } catch (e: any) {
    console.error("[PDF] Route crashed:", e?.stack || e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
