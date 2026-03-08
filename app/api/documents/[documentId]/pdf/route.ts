import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateDocumentPDF, generatePreviewPDF, getPdfDebugInfo, renderRemotePdfWithMeta } from "@/lib/pdf-service"
import { isPdfDebugEnabled, logPdfEvent } from "@/lib/pdf-logger"
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { logSecurityEvent } from "@/lib/security/audit-log"
import fs from "node:fs"

const AGENT_DEBUG_LOG_PATH = "/Users/uxellent/v0-system-owner-admin-panel/.cursor/debug.log"
function agentAppendLog(payload: any) {
  try {
    fs.appendFileSync(AGENT_DEBUG_LOG_PATH, JSON.stringify(payload) + "\n")
  } catch {
    // ignore
  }
}

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
 * - userClient: Authentication (auth.getUser())
 * - adminClient: Document fetch + storage (bypasses RLS; standard for financial docs)
 * 
 * Flow:
 * 1. Authenticate user with userClient
 * 2. Fetch document metadata with adminClient (bypasses RLS)
 * 3. If pdf_storage_key exists: Create signed URL with adminClient
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
    const ip = getClientIp(req)
    const rl = rateLimit({ key: `pdf-download:${ip}`, limit: 30, windowMs: 60_000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
    }

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
          // Never expose internal configuration details to clients.
        },
        { status: 500 }
      )
    }

    // 1) אימות משתמש (using userClient only)
    const { data: auth, error: authError } = await userClient.auth.getUser()
    
    if (authError || !auth?.user) {
      console.error("[PDF] Unauthorized:", { authError, documentId: (await params).documentId })
      agentAppendLog({
        location: "api/documents/[documentId]/pdf:unauthorized",
        message: "PDF download unauthorized",
        data: { documentId: (await params).documentId },
        timestamp: Date.now(),
        hypothesisId: "H1",
      })
      logSecurityEvent({
        event: "auth_denied",
        outcome: "denied",
        userId: null,
        companyId: null,
        requestId,
        ip,
        path: new URL(req.url).pathname,
        meta: { surface: "pdf_download" },
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { documentId } = await params
    const requestUrl = new URL(req.url)
    const requestedLangParam = requestUrl.searchParams.get("lang")
    const requestedLanguage = requestedLangParam === "en" ? "en" : requestedLangParam === "he" ? "he" : null
    const issueParam = requestUrl.searchParams.get("issue")
    const issueMode: "original" | "copy" = issueParam === "original" ? "original" : "copy"
    const inlineParam = requestUrl.searchParams.get("inline")
    const shouldInline = inlineParam === "1" || inlineParam === "true"
    const debugParam = requestUrl.searchParams.get("debug")
    const debug = debugParam === "1" || debugParam === "true"
    const debugRenderParam = requestUrl.searchParams.get("render")
    const debugRender = debugRenderParam === "1" || debugRenderParam === "true"

    agentAppendLog({
      location: "api/documents/[documentId]/pdf:entry",
      message: "PDF download requested",
      data: { documentId, userId: auth.user.id, issueMode, requestedLanguage, debug, debugRender, shouldInline },
      timestamp: Date.now(),
      hypothesisId: "H2",
    })

    if (pdfDebugEnabled) {
      console.log("[PDF] Start:", { documentId, userId: auth.user.id })
    }

    // 2) Fetch document metadata (adminClient bypasses RLS; auth already verified)
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select(
        "id, document_type, document_status, document_number, company_id, language, template_version_id, finalized_at, pdf_storage_key, pdf_storage_key_he_copy, pdf_storage_key_en, original_issued_at, original_issued_language, reference_text"
      )
      .eq("id", documentId)
      .single()

    if (docError || !doc) {
      console.error("[PDF] Document lookup failed:", { docError, documentId })
      agentAppendLog({
        location: "api/documents/[documentId]/pdf:docLookupFailed",
        message: "Document lookup failed",
        data: { documentId, docError: docError ? { message: docError.message, code: (docError as any).code } : null },
        timestamp: Date.now(),
        hypothesisId: "H3",
      })
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    agentAppendLog({
      location: "api/documents/[documentId]/pdf:docLookupOk",
      message: "Document lookup ok",
      data: { documentId, companyId: (doc as any)?.company_id, status: (doc as any)?.document_status, type: (doc as any)?.document_type },
      timestamp: Date.now(),
      hypothesisId: "H3",
    })

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
    const targetLanguage: "he" | "en" =
      requestedLanguage || (issueMode === "original" ? "he" : docLanguage)

    let effectiveIssue: "original" | "copy" = issueMode
    const isOriginalRequested = issueMode === "original" && targetLanguage === "he"
    const originalAlreadyIssued = !!(doc as any)?.original_issued_at

    // Document Copy System: Original (מקור) can only be downloaded once.
    // After first download, subsequent requests for original must be denied.
    if (isOriginalRequested && originalAlreadyIssued) {
      return NextResponse.json(
        {
          error: "ORIGINAL_ALREADY_DOWNLOADED",
          message: "מסמך מקור ניתן להוריד פעם אחת בלבד. השתמש בהעתק נאמן למקור להורדות נוספות.",
          code: "ORIGINAL_ALREADY_DOWNLOADED",
          alternativeUrl: `/api/documents/${documentId}/pdf?issue=copy&lang=he`,
        },
        { status: 403 }
      )
    }

    if (isOriginalRequested && !originalAlreadyIssued) {
      effectiveIssue = "original"
    }
    // Copy types: "העתק נאמן למקור" (HE) | "Certified Copy" (EN, when English format/settings)
    const documentCopyLabel =
      effectiveIssue === "original"
        ? "מקור"
        : targetLanguage === "en"
          ? "Certified Copy"
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

    // For COPY debug mode: expose template/render diagnostics without serving storage.
    // Normal COPY flow is storage-first below (immutable file generated during issuance/recovery).
    if (effectiveIssue === "copy" && debug) {
      if (debug) {
        const info = await getPdfDebugInfo({
          documentId,
          language: targetLanguage,
          issue: "copy",
          templateVersionId: (doc as any)?.template_version_id ? String((doc as any).template_version_id) : null,
        })

        if (!debugRender) {
          return NextResponse.json({ ok: true, ...info }, { status: 200 })
        }

        // Optional: call renderer in debug mode and capture response metadata.
        if (info.rendered_text_length < (info.min_text_length || 50)) {
          return NextResponse.json(
            {
              ok: false,
              code: "PDF_RENDER_EMPTY",
              message: "Rendered text length below threshold; refusing to call renderer",
              details: {
                template_source: info.template_source,
                rendered_text_length: info.rendered_text_length,
                counters: info.counters,
              },
            },
            { status: 422 }
          )
        }

        const meta = await renderRemotePdfWithMeta({
          html: info.final_html_for_renderer,
          css: info.final_css_for_renderer,
          footer_html: "",
          footer_css: "",
          options: { format: "A4", printBackground: true },
          artifactLabel: `pdf-debug-${documentId}`,
          templateSource: info.template_source,
          htmlCharLen: info.rendered_html_length,
          htmlTextLen: info.rendered_text_length,
        })

        return NextResponse.json({ ok: true, ...info, renderer: meta }, { status: 200 })
      }
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
          'Content-Disposition': `${shouldInline ? "inline" : "attachment"}; filename="${fileName}"`,
          'Content-Length': preview.buffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // For certified copies, always generate on-the-fly in requested language.
    // This avoids stale storage variants and keeps footer language consistent with screen/request language.
    if (effectiveIssue === "copy") {
      const isAuditorIssue =
        typeof (doc as any)?.reference_text === "string" &&
        (doc as any).reference_text.startsWith("auditor_charge:")
      const copy = await generateDocumentPDF(documentId, {
        language: targetLanguage,
        mode: "copy",
        requestId,
        context: "download",
        variant: "copy",
        isAuditorIssuanceCopy: isAuditorIssue && targetLanguage !== "en",
      })

      if (copy.success && copy.buffer) {
        const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage, effectiveIssue)
        const body = (copy.buffer as any).buffer
          ? (copy.buffer as any).buffer.slice(
              (copy.buffer as any).byteOffset || 0,
              ((copy.buffer as any).byteOffset || 0) + (copy.buffer as any).byteLength
            )
          : copy.buffer
        return new NextResponse(body as any, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${shouldInline ? "inline" : "attachment"}; filename="${fileName}"`,
            "Content-Length": String(copy.buffer.length),
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        })
      }

      // EN copies: NEVER serve from storage – stored PDF may have old "For computer use only" label.
      // Retry with mode "copy" (always generates, never uses storage).
      if (targetLanguage === "en") {
        const retry = await generateDocumentPDF(documentId, {
          language: "en",
          mode: "copy",
          context: "download",
          variant: "copy",
          requestId,
        })
        if (retry.success && retry.buffer) {
          const fileName = formatDownloadFilename(doc.document_number, documentId, "en", effectiveIssue)
          const body = (retry.buffer as any).buffer
            ? (retry.buffer as any).buffer.slice(
                (retry.buffer as any).byteOffset || 0,
                ((retry.buffer as any).byteOffset || 0) + (retry.buffer as any).byteLength
              )
            : retry.buffer
          return new NextResponse(body as any, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `${shouldInline ? "inline" : "attachment"}; filename="${fileName}"`,
              "Content-Length": String(retry.buffer.length),
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          })
        }
        return NextResponse.json(
          {
            error: "PDF_GENERATION_FAILED",
            message: retry.error || "Failed to generate English PDF with Certified Copy label.",
          },
          { status: 500 }
        )
      }
    }

    // Finalized/cancelled: serve the immutable stored PDF (generated/signed during finalization).
    // Storage is accessed with adminClient (service role), while doc access uses RLS via userClient.
    // MUST be private (legacy fallback to PUBLIC_ASSETS_BUCKET exists only for already-issued PDFs).
    const primaryBucket = SECURE_ASSETS_BUCKET
    const fromDoc =
      targetLanguage === "en"
        ? ((doc as any)?.pdf_storage_key_en as string | null)
        : effectiveIssue === "copy"
          ? ((doc as any)?.pdf_storage_key_he_copy as string | null)
          : ((doc as any)?.pdf_storage_key as string | null)

    const expected =
      targetLanguage === "en"
        ? `documents/${documentId}/source.en.pdf`
        : effectiveIssue === "copy"
          ? `documents/${documentId}/copy.he.pdf`
          : `documents/${documentId}/original.he.pdf`

    const rawKey = (fromDoc && String(fromDoc).trim().length > 0) ? String(fromDoc) : expected
    const storageKey = rawKey.replace(/^\/+/, "")

    // Defense-in-depth: never trust DB storage keys beyond document scope.
    const allowedPrefix = `documents/${documentId}/`
    const scopedStorageKey = storageKey.startsWith(allowedPrefix) && !storageKey.includes("..") ? storageKey : expected

    let file: any = null
    let dlError: any = null

    ;({ data: file, error: dlError } = await adminClient.storage
      .from(primaryBucket)
      .download(scopedStorageKey))

    // Legacy migration: old PDFs were stored in the public bucket.
    // If found there, copy to the private bucket and remove from public (best-effort).
    if (dlError || !file) {
      const legacy = await adminClient.storage.from(PUBLIC_ASSETS_BUCKET).download(scopedStorageKey)
      if (!legacy.error && legacy.data) {
        file = legacy.data
        dlError = null
        try {
          const buf = Buffer.from(await (legacy.data as any).arrayBuffer())
          const up = await adminClient.storage
            .from(primaryBucket)
            .upload(scopedStorageKey, buf, { contentType: "application/pdf", upsert: false })

          // If upload succeeded (or already existed), remove the public copy.
          if (!up.error || String(up.error?.message || "").toLowerCase().includes("already exists")) {
            await adminClient.storage.from(PUBLIC_ASSETS_BUCKET).remove([scopedStorageKey])
          }
        } catch {
          // ignore migration failures
        }
      } else {
        dlError = legacy.error
      }
    }

    if (dlError || !file) {
      agentAppendLog({
        location: "api/documents/[documentId]/pdf:storageMissing",
        message: "PDF not found in storage; attempting recovery generation",
        data: {
          documentId,
          bucket: primaryBucket,
          key: scopedStorageKey,
          legacyTried: true,
          dlError: dlError ? { message: String(dlError.message || ""), name: String((dlError as any)?.name || "") } : null,
          issue: effectiveIssue,
          lang: targetLanguage,
        },
        timestamp: Date.now(),
        hypothesisId: "H_PDF_RECOVERY",
      })

      // Recovery fallback: generate immutable PDF on-demand, then re-download from storage.
      // This covers auto-issued documents that bypass finalizeDocument and thus lack pdf_storage_key files.
      const gen = await generateDocumentPDF(documentId, {
        language: targetLanguage,
        mode: "recovery",
        context: "download",
        variant: effectiveIssue,
        isIssuance: true,
        allowEnInFinalization: targetLanguage === "en",
        requestId,
      })

      agentAppendLog({
        location: "api/documents/[documentId]/pdf:recoveryResult",
        message: "Recovery PDF generation finished",
        data: {
          documentId,
          ok: !!gen?.success,
          error: gen?.success ? null : String((gen as any)?.error || "unknown"),
        },
        timestamp: Date.now(),
        hypothesisId: "H_PDF_RECOVERY",
      })

      // Local/dev fallback: if signing is not configured, serve a preview PDF so downloads still work.
      // (Regulatory signing is enforced by env in production.)
      const genErrorStr = gen?.success ? "" : String((gen as any)?.error || "")
      const signingMissing =
        genErrorStr.includes("SIGNING_P12_BASE64") ||
        genErrorStr.includes("SIGNING_P12_PASSWORD") ||
        genErrorStr.includes("Missing env var: SIGNING_P12")

      if (!gen?.success && signingMissing && process.env.NODE_ENV !== "production") {
        agentAppendLog({
          location: "api/documents/[documentId]/pdf:devSigningFallback",
          message: "Signing env missing; serving COPY PDF fallback (with footer, no draft watermark)",
          data: { documentId, issue: effectiveIssue, lang: targetLanguage },
          timestamp: Date.now(),
          hypothesisId: "H_PDF_SIGNING_ENV",
        })

        const isAuditorIssue =
          typeof (doc as any)?.reference_text === "string" &&
          (doc as any).reference_text.startsWith("auditor_charge:")
        const copy = await generateDocumentPDF(documentId, {
          language: targetLanguage,
          mode: "copy",
          requestId,
          context: "download",
          variant: effectiveIssue,
          isAuditorIssuanceCopy: isAuditorIssue && targetLanguage !== "en",
        })
        if (copy.success && copy.buffer) {
          const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage, effectiveIssue)
          const body = (copy.buffer as any).buffer
            ? (copy.buffer as any).buffer.slice(
                (copy.buffer as any).byteOffset || 0,
                ((copy.buffer as any).byteOffset || 0) + (copy.buffer as any).byteLength
              )
            : copy.buffer
          return new NextResponse(body as any, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${fileName}"`,
              "Content-Length": String(copy.buffer.length),
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          })
        }
      }

      if (gen?.success) {
        // Retry download from storage (should exist now).
        ;({ data: file, error: dlError } = await adminClient.storage.from(primaryBucket).download(scopedStorageKey))
      }
    }

    if (dlError || !file) {
      return NextResponse.json(
        { error: "PDF_NOT_AVAILABLE", code: "PDF_NOT_AVAILABLE" },
        { status: 404 }
      )
    }

    // Security log + audit trail (best-effort; must not block PDF delivery).
    try {
      const ua = req.headers.get("user-agent")
      await userClient.from("document_events").insert({
        document_id: doc.id,
        company_id: (doc as any).company_id,
        event_type: "viewed",
        ip_address: ip && ip !== "unknown" ? ip : null,
        user_agent: ua ? String(ua).slice(0, 512) : null,
        event_data: { kind: "pdf_download", issue: effectiveIssue, lang: targetLanguage },
      } as any)

      logSecurityEvent({
        event: "pdf_download",
        outcome: "succeeded",
        userId: auth.user.id,
        companyId: (doc as any).company_id || null,
        requestId,
        ip,
        path: new URL(req.url).pathname,
        meta: { issue: effectiveIssue, lang: targetLanguage },
      })
    } catch (e) {
      // ignore
    }

    // Mark original issued (idempotent) when we successfully serve it.
    if (effectiveIssue === "original" && targetLanguage === "he" && !originalAlreadyIssued) {
      const nowIso = new Date().toISOString()
      await userClient
        .from("documents")
        .update({ original_issued_at: nowIso, original_issued_language: "he" })
        .eq("id", documentId)
        .is("original_issued_at", null)
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const fileName = formatDownloadFilename(doc.document_number, documentId, targetLanguage, effectiveIssue)

    return new NextResponse(buf as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${shouldInline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (e: any) {
    console.error("[PDF] Route crashed:", e?.stack || e)
    agentAppendLog({
      location: "api/documents/[documentId]/pdf:crash",
      message: "PDF route crashed",
      data: { error: String(e?.message || e) },
      timestamp: Date.now(),
      hypothesisId: "H4",
    })
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
