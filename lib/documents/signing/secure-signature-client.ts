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
  email?: string | null,
  contactName?: string | null
): Promise<void> {
  // #region agent log
  const requestBody = {
    business_id: businessId,
    name,
    tax_id: taxId,
    email,
    contact_name: contactName,
  };
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:51',message:'Registering business with dsign',data:{businessId8:businessId.substring(0,8),requestBody:requestBody},timestamp:Date.now(),sessionId:'debug-session',runId:'fix-verification',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  
  try {
    // Try DELETE first to remove old certificate
    const deleteResponse = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/businesses/${businessId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    })
    
    // #region agent log
    const deleteResponseData = await deleteResponse.json().catch(() => ({}));
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:71',message:'Business DELETE response from dsign',data:{status:deleteResponse.status,ok:deleteResponse.ok,responseData:deleteResponseData},timestamp:Date.now(),sessionId:'debug-session',runId:'fix-verification',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    
    // Now POST to create/update
    const postResponse = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/businesses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })
    
    // #region agent log
    const postResponseData = await postResponse.json().catch(() => ({}));
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:91',message:'Business POST response from dsign',data:{status:postResponse.status,ok:postResponse.ok,responseData:postResponseData},timestamp:Date.now(),sessionId:'debug-session',runId:'fix-verification',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
  } catch (e: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:95',message:'Business registration error',data:{error:e?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'fix-verification',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    // ignore
  }
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
    params.businessEmail || params.metadata?.email,
    params.businessContactName || params.metadata?.business_contact_name
  )

  const url = `${baseUrl.replace(/\/+$/, "")}/v1/signing/requests`

  const body: SecureSignatureCreateRequest = {
    business_id: params.businessId,
    external_doc_id: params.externalDocId,
    supplier_name: params.supplierName || params.metadata?.supplier_name || "VOW System",
    business_name: params.businessName || params.metadata?.business_name || "Unknown Business",
    business_tax_id: params.businessTaxId || params.metadata?.business_tax_id || null,
    metadata: params.metadata || {},
    document_base64: base64FromBuffer(params.pdfBytes),
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:158',message:'Signing request body (without base64)',data:{businessId:body.business_id,externalDocId:body.external_doc_id,supplierName:body.supplier_name,businessName:body.business_name,businessTaxId:body.business_tax_id,metadataKeys:body.metadata?Object.keys(body.metadata):[],hasDocumentBase64:!!body.document_base64},timestamp:Date.now(),sessionId:'debug-session',runId:'fix-verification',hypothesisId:'H'})}).catch(()=>{});
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'secure-signature-client.ts:253',message:'Response from dsign API',data:{hasSignedPdf:!!signedPdfBase64,certInfo:certInfo,hashes:hashes,events:events,requestId:requestId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

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
