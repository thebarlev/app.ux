import "server-only"

import { logSecurityEvent } from "@/lib/security/audit-log"
import { hostFromUrl } from "@/lib/diagnostics/external-services-check"

type SecureSignatureCreateRequest = {
  business_id: string
  external_doc_id: string
  supplier_name: string
  business_name: string
  business_tax_id?: string | null
  metadata?: Record<string, any>
  pdf_base64?: string
  document_base64?: string
}

type SecureSignatureCreateResponse =
  | {
      ok: true
      id?: string | null
      request_id?: string | null
      signed_pdf_base64: string
      cert_info?: Record<string, any> | null
      hashes?: Record<string, any> | null
      events?: Array<Record<string, any>> | null
      message?: string
      code?: string
    }
  | {
      ok: false
      id?: string | null
      request_id?: string | null
      code?: string
      message?: string
      cert_info?: Record<string, any> | null
      hashes?: Record<string, any> | null
      events?: Array<Record<string, any>> | null
      error?: string
    }

function base64FromBuffer(buf: Buffer): string {
  return buf.toString("base64")
}

function bufferFromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64")
}

function estimateDecodedBytesFromBase64Len(base64Len: number, endsWithPadding: boolean, endsWithDoublePadding: boolean): number {
  // Base64 length → decoded bytes (approx, but correct for valid base64 produced by Buffer.toString("base64"))
  // bytes = (len * 3 / 4) - paddingCount
  const pad = endsWithDoublePadding ? 2 : endsWithPadding ? 1 : 0
  return Math.max(0, Math.floor((base64Len * 3) / 4) - pad)
}

function bufferLooksLikePdf(buf: Buffer): boolean {
  // "%PDF"
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
}

export function sha256Hex(buf: Buffer): string {
  const crypto = require("crypto") as typeof import("crypto")
  return crypto.createHash("sha256").update(new Uint8Array(buf)).digest("hex")
}

export type BusinessEnsureResult =
  | { ok: true; status: number; alreadyExisted: boolean }
  | { ok: false; status: number | null; body: string; error: string | null }

/**
 * Registers the business with the signing service, idempotently.
 *
 * This used to DELETE the business ("to remove old certificate") and then POST
 * it back, with both calls unchecked inside `try { } catch { /* ignore *\/ }`.
 * Three things were wrong with that, and all three are fixed here:
 *
 *  - The DELETE opened a window in which the business did not exist. Signing of
 *    "מקור" and "העתק" runs concurrently, with retries, and the dedupe cache is
 *    per-process — so on a multi-instance deployment one instance's DELETE could
 *    land after another's POST and leave the business deleted. Every subsequent
 *    signing call then returns 403 `business_not_in_source`. A registration step
 *    must never be able to unregister a working business, so the DELETE is gone.
 *    (If certificate rotation is still wanted it needs a dedicated
 *    non-destructive endpoint on the signing service — deleting the business to
 *    refresh its certificate is not a safe way to get one.)
 *
 *  - Nothing was checked. Any status, any body, any network error was discarded,
 *    so a failed registration was indistinguishable from a successful one and
 *    left no trace anywhere. Now the status is checked, the body is read on
 *    failure, and the outcome is returned to the caller.
 *
 *  - Concurrent POSTs for the same business are harmless: the call is treated as
 *    idempotent, with "already exists" (409, or 2xx from an upsert) counted as
 *    success. This works whether the service upserts or rejects duplicates.
 */
async function ensureBusinessRegistered(
  baseUrl: string,
  apiKey: string,
  businessId: string,
  name: string,
  taxId?: string | null,
  email?: string | null,
  contactName?: string | null
): Promise<BusinessEnsureResult> {
  const requestBody = {
    business_id: businessId,
    name,
    tax_id: taxId,
    email,
    contact_name: contactName,
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/businesses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    })

    if (res.ok) {
      return { ok: true, status: res.status, alreadyExisted: res.status === 200 }
    }

    // A duplicate is the expected answer for a business that is already there,
    // which is the normal case on every issuance after the first.
    if (res.status === 409) {
      return { ok: true, status: res.status, alreadyExisted: true }
    }

    const body = await res.text().catch(() => "")
    return { ok: false, status: res.status, body: body.slice(0, 500), error: null }
  } catch (e: any) {
    return { ok: false, status: null, body: "", error: String(e?.cause?.code || e?.code || e?.message || e).slice(0, 200) }
  }
}

const BUSINESS_ENSURE_TTL_MS = 5 * 60 * 1000
const businessEnsureCache = new Map<string, { expiresAt: number; promise: Promise<BusinessEnsureResult> }>()

/**
 * Deduplicates concurrent registrations of the same business and remembers the
 * result for a while.
 *
 * Only successes are remembered. The previous version cached the promise
 * unconditionally, and because the underlying call swallowed every error it
 * always resolved — so a failed registration was cached as "done" and not
 * retried for five minutes, exactly when retrying was what was needed.
 *
 * Concurrent callers still share one in-flight request (the promise is stored
 * before it settles), so "מקור" and "העתק" cannot race each other.
 */
async function ensureBusinessRegisteredOnce(
  baseUrl: string,
  apiKey: string,
  businessId: string,
  name: string,
  taxId?: string | null,
  email?: string | null,
  contactName?: string | null
): Promise<BusinessEnsureResult> {
  const now = Date.now()
  const hit = businessEnsureCache.get(businessId)
  if (hit && hit.expiresAt > now) {
    return hit.promise
  }

  const p = ensureBusinessRegistered(baseUrl, apiKey, businessId, name, taxId, email, contactName)
  businessEnsureCache.set(businessId, { expiresAt: now + BUSINESS_ENSURE_TTL_MS, promise: p })

  let result: BusinessEnsureResult
  try {
    result = await p
  } catch (e) {
    businessEnsureCache.delete(businessId)
    throw e
  }

  // Never let a failure stick: the next issuance must try again.
  if (!result.ok) businessEnsureCache.delete(businessId)

  return result
}

function pickRequestId(json: any): string | null {
  const a = typeof json?.request_id === "string" ? json.request_id : null
  const b = typeof json?.id === "string" ? json.id : null
  return a || b
}

export async function createSigningRequest(params: {
  businessId: string
  externalDocId: string
  supplierName?: string
  businessName?: string
  businessTaxId?: string | null
  businessContactName?: string | null
  businessEmail?: string | null
  metadata?: Record<string, any>
  pdfBytes: Buffer
  /** Optional correlation id from the calling route — threaded into [DOC_ISSUE] logs. */
  attemptId?: string
}): Promise<
  | {
      ok: true
      requestId: string | null
      signedPdfBytes: Buffer
      signedPdfSha256: string
      certInfo: Record<string, any> | null
      hashes: Record<string, any> | null
      events: Array<Record<string, any>> | null
    }
  | {
      ok: false
      code: "already_exists" | "http_error" | "bad_response" | "misconfigured"
      message: string
      requestId: string | null
      certInfo: Record<string, any> | null
      hashes: Record<string, any> | null
      events: Array<Record<string, any>> | null
      status?: number
    }
> {
  const baseUrl = process.env.SECURE_SIGNATURE_BASE_URL?.trim()
  const apiKey = process.env.SECURE_SIGNATURE_API_KEY?.trim()

  // Debug: prefix6+suffix4 only (10 of 48 chars). Lets us cross-check the
  // API key sent here against the row in DSign's Supabase `sources` table
  // without exposing the full secret in logs.
  console.log("[API_KEY_DEBUG][app.uxellent]", {
    apiKeyLen: typeof apiKey === "string" ? apiKey.length : 0,
    apiKeyPrefix6: typeof apiKey === "string" ? apiKey.slice(0, 6) : null,
    apiKeySuffix4: typeof apiKey === "string" ? apiKey.slice(-4) : null,
    baseUrlHost: (() => {
      try { return new URL(baseUrl || "").host } catch { return null }
    })(),
    apiKeyPresent: Boolean(apiKey),
  });

  const attemptId = params.attemptId || null

  if (!baseUrl || !apiKey) {
    if (attemptId) {
      console.error("[DOC_ISSUE]", {
        attempt_id: attemptId,
        step: "sign_request_misconfigured",
        level: "error",
        secure_signature_base_url_present: !!baseUrl,
        secure_signature_api_key_present: !!apiKey,
      })
    }
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId: null,
      ip: null,
      path: null,
      meta: { code: "misconfigured", message: "missing_env", externalDocId: params.externalDocId },
    })
    return {
      ok: false,
      code: "misconfigured",
      message: "missing_env",
      requestId: null,
      certInfo: null,
      hashes: null,
      events: null,
    }
  }

  // Register the business first. This is idempotent and never destructive, so a
  // concurrent or repeated call cannot unregister a business that already works.
  const ensureT0 = Date.now()
  const ensured = await ensureBusinessRegisteredOnce(
    baseUrl,
    apiKey,
    params.businessId,
    params.businessName || params.metadata?.business_name || "Unknown Business",
    params.businessTaxId || params.metadata?.business_tax_id,
    params.businessEmail || params.metadata?.email,
    params.businessContactName || params.metadata?.business_contact_name
  )

  // Make the registration step visible. Previously it produced no output at all,
  // so a failure here surfaced only as an unexplained 403 from the signing call.
  if (attemptId) {
    console.log("[DOC_ISSUE]", {
      attempt_id: attemptId,
      step: ensured.ok ? "sign_business_ensure_ok" : "sign_business_ensure_failed",
      ...(ensured.ok ? {} : { level: "error" }),
      duration_ms: Date.now() - ensureT0,
      business_id8: String(params.businessId || "").slice(0, 8),
      secure_signature_host: hostFromUrl(baseUrl),
      http_status: ensured.status,
      ...(ensured.ok
        ? { already_existed: ensured.alreadyExisted }
        : { response_body: ensured.body || null, fetch_error: ensured.error }),
    })
  }

  if (!ensured.ok) {
    // Deliberately not fatal. If the business is in fact already registered, an
    // unexpected answer here should not block a signature that would succeed;
    // and if it is genuinely missing, the signing call below returns
    // 403 business_not_in_source, which finalizeDocument already classifies and
    // explains to the user. The failure is now logged and, crucially, not cached.
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId: null,
      ip: null,
      path: null,
      meta: {
        code: "business_ensure_failed",
        message: `status=${ensured.status ?? "none"} ${ensured.error || ensured.body || ""}`.trim().slice(0, 300),
        externalDocId: params.externalDocId,
      },
    })
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/v1/signing/requests`
  const agentSigningT0 = Date.now()

  const base64FieldMode = (process.env.SECURE_SIGNATURE_BASE64_FIELD || "").toLowerCase()
  const pdfBase64 = base64FromBuffer(params.pdfBytes)
  const shouldSendPdfBase64 = base64FieldMode === "pdf" || base64FieldMode === "pdf_base64"

  const body: SecureSignatureCreateRequest = {
    business_id: params.businessId,
    external_doc_id: params.externalDocId,
    supplier_name: params.supplierName || params.metadata?.supplier_name || "VOW System",
    business_name: params.businessName || params.metadata?.business_name || "Unknown Business",
    business_tax_id: params.businessTaxId || params.metadata?.business_tax_id || null,
    metadata: params.metadata || {},
    ...(shouldSendPdfBase64 ? { pdf_base64: pdfBase64 } : { document_base64: pdfBase64 }),
  }

  // Debug logs requested (no base64 content, but includes metadata + sizes/signature checks)
  const sentBase64Field = shouldSendPdfBase64 ? "pdf_base64" : "document_base64"
  const sentBase64 = (shouldSendPdfBase64 ? body.pdf_base64 : body.document_base64) || ""
  const base64Len = typeof sentBase64 === "string" ? sentBase64.length : 0
  const endsWithDoublePadding = typeof sentBase64 === "string" && sentBase64.endsWith("==")
  const endsWithPadding = typeof sentBase64 === "string" && !endsWithDoublePadding && sentBase64.endsWith("=")
  const estimatedDecodedBytes = estimateDecodedBytesFromBase64Len(base64Len, endsWithPadding, endsWithDoublePadding)
  const startsWithPdfB64Signature = typeof sentBase64 === "string" && sentBase64.startsWith("JVBERi0")

  console.log("[SIGN_FLOW][DSIGN_BASE64_DEBUG]", {
    base64Field: sentBase64Field,
    hasBase64: typeof sentBase64 === "string" && sentBase64.length > 0,
    base64Chars: base64Len,
    estimatedDecodedBytes,
    // Ground-truth bytes (we generate base64 from this buffer)
    pdfBytes: params.pdfBytes?.length ?? null,
    pdfBytesLooksLikePdf: bufferLooksLikePdf(params.pdfBytes),
    base64StartsWithJVBERi0: startsWithPdfB64Signature,
    metadata: body.metadata || {},
  })

  // SAFE debug logs (no base64 / no PII)
  console.log("[SIGN_FLOW][DSIGN_PAYLOAD]", {
    urlHost: (url || "").replace("https://", "").replace("http://", "").split("/")[0] || null,
    contentType: "application/json",
    externalDocId: body.external_doc_id,
    businessId8: String(body.business_id || "").slice(0, 8),
    base64Field: shouldSendPdfBase64 ? "pdf_base64" : "document_base64",
    has_document_base64: typeof body.document_base64 === "string" && body.document_base64.length > 0,
    document_base64_length: typeof body.document_base64 === "string" ? body.document_base64.length : 0,
    has_pdf_base64: typeof body.pdf_base64 === "string" && body.pdf_base64.length > 0,
    pdf_base64_length: typeof body.pdf_base64 === "string" ? body.pdf_base64.length : 0,
    metadata_keys: body.metadata ? Object.keys(body.metadata) : [],
  })

  let res: Response
  const startedAt = Date.now()
  const dsignHost = hostFromUrl(baseUrl)

  console.log("[SIGN_FLOW] signing API call", {
    endpoint: "/v1/signing/requests",
    baseUrlHost: (baseUrl || "").replace("https://", "").replace("http://", "").split("/")[0] || null,
    externalDocId: params.externalDocId,
    businessId8: String(params.businessId || "").slice(0, 8),
    supplierName: body.supplier_name,
    businessName: body.business_name,
    attempt_id: attemptId,
  })
  if (attemptId) {
    console.log("[DOC_ISSUE]", {
      attempt_id: attemptId,
      step: "sign_fetch_start",
      secure_signature_host: dsignHost,
      external_doc_id: params.externalDocId,
      pdf_bytes: params.pdfBytes?.length ?? null,
    })
  }

  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    if (attemptId) {
      console.error("[DOC_ISSUE]", {
        attempt_id: attemptId,
        step: "sign_fetch_failed",
        level: "error",
        duration_ms: Date.now() - startedAt,
        secure_signature_host: dsignHost,
        error_message: e?.message ?? String(e ?? ""),
        error_code: e?.code ?? null,
        error_name: e?.name ?? null,
      })
    }
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId: null,
      ip: null,
      path: null,
      meta: { code: "http_error", message: e?.message || String(e), externalDocId: params.externalDocId },
    })
    return {
      ok: false,
      code: "http_error",
      message: e?.message || String(e),
      requestId: null,
      certInfo: null,
      hashes: null,
      events: null,
    }
  }

  console.log("[SIGN_FLOW] signing API response received", {
    status: res.status,
    ok: res.ok,
    time_ms: Date.now() - startedAt,
    externalDocId: params.externalDocId,
    attempt_id: attemptId,
  })
  if (attemptId) {
    console.log("[DOC_ISSUE]", {
      attempt_id: attemptId,
      step: res.ok ? "sign_fetch_response_ok" : "sign_fetch_response_http_error",
      duration_ms: Date.now() - startedAt,
      secure_signature_host: dsignHost,
      http_status: res.status,
    })
  }

  let json: any = null
  // Read once as text, then parse JSON. (res.json() consumes the body, so we can't log body on parse failure.)
  let rawText = ""
  try {
    rawText = await res.text()
  } catch {
    rawText = ""
  }

  try {
    json = rawText ? (JSON.parse(rawText) as SecureSignatureCreateResponse) : null
  } catch {
    const snippet = typeof rawText === "string" ? rawText.slice(0, 1200) : ""
    console.error("[SIGN_FLOW] signing API non-JSON response", {
      status: res.status,
      ok: res.ok,
      externalDocId: params.externalDocId,
      contentType: res.headers.get("content-type") || null,
      bodySnippet: snippet || null,
    })
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId: null,
      ip: null,
      path: null,
      meta: { code: "bad_response", status: res.status, externalDocId: params.externalDocId },
    })
    return {
      ok: false,
      code: "bad_response",
      message: `non_json_response status=${res.status}${snippet ? ` body=${snippet}` : ""}`,
      requestId: null,
      certInfo: null,
      hashes: null,
      events: null,
      status: res.status,
    }
  }

  const requestId = pickRequestId(json)

  // ✅ לוג שמראה מה קיבלנו, בלי ה-PDF
  console.log("[SIGN_FLOW] signing API response body (safe)", {
    status: res.status,
    ok: res.ok,
    requestId,
    code: typeof json?.code === "string" ? json.code : null,
    message: typeof json?.message === "string" ? json.message : null,
    hasSignedPdfBase64: typeof json?.signed_pdf_base64 === "string",
    externalDocId: params.externalDocId,
  })

  const message = typeof json?.message === "string" ? json.message : ""
  const code = typeof json?.code === "string" ? json.code : ""
  const certInfo = json?.cert_info && typeof json.cert_info === "object" ? (json.cert_info as any) : null
  const hashes = json?.hashes && typeof json.hashes === "object" ? (json.hashes as any) : null
  const events = Array.isArray(json?.events) ? (json.events as any) : null

  if (!res.ok) {
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId,
      ip: null,
      path: null,
      meta: { code: "http_error", status: res.status, externalDocId: params.externalDocId },
    })
    return {
      ok: false,
      code: "http_error",
      message: json?.error || message || `http_error status=${res.status}`,
      requestId,
      certInfo,
      hashes,
      events,
      status: res.status,
    }
  }

  if (message === "already_exists" || code === "already_exists") {
    return {
      ok: false,
      code: "already_exists",
      message: "already_exists",
      requestId,
      certInfo,
      hashes,
      events,
      status: res.status,
    }
  }

  const signedPdfBase64 =
    typeof (json as any)?.signed_pdf_base64 === "string" ? (json as any).signed_pdf_base64 : null

  if (!signedPdfBase64) {
    logSecurityEvent({
      event: "signing_failed",
      outcome: "failed",
      userId: null,
      companyId: params.businessId || null,
      requestId,
      ip: null,
      path: null,
      meta: { code: "bad_response", message: "missing_signed_pdf_base64", status: res.status, externalDocId: params.externalDocId },
    })
    return {
      ok: false,
      code: "bad_response",
      message: "missing_signed_pdf_base64",
      requestId,
      certInfo,
      hashes,
      events,
      status: res.status,
    }
  }

  const signedPdfBytes = bufferFromBase64(signedPdfBase64)
  return {
    ok: true,
    requestId,
    signedPdfBytes,
    signedPdfSha256: sha256Hex(signedPdfBytes),
    certInfo,
    hashes,
    events,
  }
}
