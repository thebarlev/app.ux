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
