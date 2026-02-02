import "server-only"

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
      request_id: string | null
      signed_pdf_base64: string
      cert_info?: Record<string, any> | null
      hashes?: Record<string, any> | null
      events?: Array<Record<string, any>> | null
      message?: string
    }
  | {
      ok: false
      code?: string
      message?: string
      request_id?: string | null
      cert_info?: Record<string, any> | null
      hashes?: Record<string, any> | null
      events?: Array<Record<string, any>> | null
      error?: string
    }

function base64FromBuffer(buf: Buffer): string {
  return Buffer.from(buf).toString("base64")
}

function bufferFromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64")
}

export function sha256Hex(buf: Buffer): string {
  const crypto = require("crypto") as typeof import("crypto")
  return crypto.createHash("sha256").update(new Uint8Array(buf)).digest("hex")
}

async function ensureBusinessRegistered(
  baseUrl: string,
  apiKey: string,
  businessId: string,
  name: string,
  taxId?: string | null,
  email?: string | null
): Promise<void> {
  try {
    await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/businesses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        business_id: businessId,
        name,
        tax_id: taxId,
        email,
      }),
    });
  } catch {
    // ignore
  }
}

export async function createSigningRequest(params: {
  businessId: string
  externalDocId: string
  supplierName?: string
  businessName?: string
  businessTaxId?: string | null
  metadata?: Record<string, any>
  pdfBytes: Buffer
}): Promise
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
{
  const baseUrl = process.env.SECURE_SIGNATURE_BASE_URL?.trim()
  const apiKey = process.env.SECURE_SIGNATURE_API_KEY?.trim()

  if (!baseUrl || !apiKey) {
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

  // Register business first
  await ensureBusinessRegistered(
    baseUrl,
    apiKey,
    params.businessId,
    params.businessName || params.metadata?.business_name || "Unknown Business",
    params.businessTaxId || params.metadata?.business_tax_id,
    params.metadata?.email
  );

  const url = `${baseUrl.replace(/\/+$/, "")}/v1/signing/requests`
  const body: SecureSignatureCreateRequest = {
    business_id: params.businessId,
    external_doc_id: params.externalDocId,
    supplier_name: params.supplierName || params.metadata?.supplier_name || "VOW System",
    business_name: params.businessName || params.metadata?.business_name || "Unknown Business",
    business_tax_id: params.businessTaxId || params.metadata?.business_tax_id || null,
    metadata: params.metadata || {},
    pdf_base64: base64FromBuffer(params.pdfBytes),
    document_base64: base64FromBuffer(params.pdfBytes),
  }

  let res: Response
  const startedAt = Date.now()
  
  console.log("[SIGN_FLOW] signing API call", {
    endpoint: "/v1/signing/requests",
    baseUrlHost: (baseUrl || "").replace("https://", "").replace("http://", "").split("/")[0] || null,
    externalDocId: params.externalDocId,
    businessId8: String(params.businessId || "").slice(0, 8),
    supplierName: body.supplier_name,
    businessName: body.business_name,
  })

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
  })

  let json: any = null
  try {
    json = (await res.json()) as SecureSignatureCreateResponse
  } catch {
    return {
      ok: false,
      code: "bad_response",
      message: `non_json_response status=${res.status}`,
      requestId: null,
      certInfo: null,
      hashes: null,
      events: null,
      status: res.status,
    }
  }

  const requestId = typeof json?.request_id === "string" ? json.request_id : null
  const message = typeof json?.message === "string" ? json.message : ""
  const certInfo = json?.cert_info && typeof json.cert_info === "object" ? (json.cert_info as any) : null
  const hashes = json?.hashes && typeof json.hashes === "object" ? (json.hashes as any) : null
  const events = Array.isArray(json?.events) ? (json.events as any) : null

  if (!res.ok) {
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

  if (message === "already_exists" || json?.code === "already_exists") {
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

  const signedPdfBase64 = typeof (json as any)?.signed_pdf_base64 === "string" ? (json as any).signed_pdf_base64 : null
  if (!signedPdfBase64) {
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