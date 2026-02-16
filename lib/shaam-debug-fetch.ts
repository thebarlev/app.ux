import "server-only"

type ProxyDetected = {
  http: boolean
  https: boolean
  all: boolean
  no: boolean
}

export type ShaamDebugClassification = "UPSTREAM_BLOCK_PAGE" | "SHAAM_API_RESPONSE"

export type ShaamDebugFailureEvent = {
  event: "shaam_request_failure"
  classification: ShaamDebugClassification
  status: number
  region: string | null
  runtime: string | null
  proxyDetected: ProxyDetected
  egressIp: string | null
  timestamp: string
  surface?: string | null
  url?: string | null
  method?: string | null
  responseContentType?: string | null
  responseServer?: string | null
  responseVia?: string | null
  bodyPreview?: string | null
}

function isDebugEnabled(): boolean {
  return String(process.env.SHAAM_DEBUG || "").trim().toLowerCase() === "true"
}

function proxyDetected(): ProxyDetected {
  return {
    http: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
    https: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
    all: Boolean(process.env.ALL_PROXY || process.env.all_proxy),
    no: Boolean(process.env.NO_PROXY || process.env.no_proxy),
  }
}

function runtimeInfo() {
  return {
    region: process.env.VERCEL_REGION ? String(process.env.VERCEL_REGION) : null,
    runtime: process.env.NEXT_RUNTIME ? String(process.env.NEXT_RUNTIME) : "nodejs",
  }
}

function safeUrl(input: RequestInfo | URL): string {
  try {
    const u = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(String((input as any)?.url || ""))
    // Drop querystring to avoid accidental secrets
    return `${u.origin}${u.pathname}`
  } catch {
    return typeof input === "string" ? input.split("?")[0] : "[unparseable_url]"
  }
}

function classify(params: { status: number; contentType: string }): ShaamDebugClassification {
  if (params.status === 403 && params.contentType.toLowerCase().includes("text/html")) return "UPSTREAM_BLOCK_PAGE"
  return "SHAAM_API_RESPONSE"
}

function looksLikeBlockPage(htmlOrText: string): boolean {
  const s = String(htmlOrText || "").toLowerCase()
  return (
    s.includes("<!doctype html") ||
    s.includes("<html") ||
    s.includes("access denied") ||
    s.includes("forbidden") ||
    s.includes("cloudflare") ||
    s.includes("attention required") ||
    s.includes("request blocked") ||
    s.includes("incident id")
  )
}

export async function shaamDebugFetch(params: {
  url: string | URL
  init: RequestInit & { dispatcher?: any }
  surface?: string
}): Promise<{ res: Response; textPreview: string | null; json: any | null }> {
  const debug = isDebugEnabled()
  const startedAtIso = new Date().toISOString()
  const urlSafe = safeUrl(params.url)
  const method = (params.init?.method || "GET").toUpperCase()

  if (debug) {
    console.log("[SHAAM DEBUG] request", {
      timestamp: startedAtIso,
      url: urlSafe,
      method,
      region: runtimeInfo().region,
      runtime: runtimeInfo().runtime,
      proxyDetected: proxyDetected(),
      surface: params.surface || null,
    })
  }

  const res = await fetch(params.url, params.init as any)

  const contentType = res.headers.get("content-type") || ""
  const server = res.headers.get("server")
  const via = res.headers.get("via")

  let textPreview: string | null = null
  let json: any | null = null

  // Only read body for debug / failures / HTML to avoid consuming the stream.
  if (debug && (!res.ok || contentType.toLowerCase().includes("text/html"))) {
    const cloned = res.clone()
    const text = await cloned.text().catch(() => "")
    textPreview = String(text || "").slice(0, 500)

    console.log("[SHAAM DEBUG] response", {
      timestamp: new Date().toISOString(),
      url: urlSafe,
      method,
      status: res.status,
      headers: {
        contentType,
        server,
        via,
      },
      bodyPreview: textPreview,
      blockPageLikely: looksLikeBlockPage(textPreview),
    })
  }

  // If it's JSON and we haven't consumed it, parse via clone so callers can still read original if needed.
  if (contentType.toLowerCase().includes("application/json")) {
    const cloned = res.clone()
    json = await cloned.json().catch(() => null)
  }

  if (debug && !res.ok) {
    const classification = classify({ status: res.status, contentType })
    const info = runtimeInfo()
    const event: ShaamDebugFailureEvent = {
      event: "shaam_request_failure",
      classification,
      status: res.status,
      region: info.region,
      runtime: info.runtime,
      proxyDetected: proxyDetected(),
      egressIp: null,
      timestamp: new Date().toISOString(),
      surface: params.surface || null,
      url: urlSafe,
      method,
      responseContentType: contentType || null,
      responseServer: server || null,
      responseVia: via || null,
      bodyPreview: textPreview,
    }
    console.log("[SHAAM DEBUG] event", event)
  }

  return { res, textPreview, json }
}

