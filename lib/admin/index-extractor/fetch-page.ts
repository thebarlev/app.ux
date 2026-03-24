import { fetchTextBounded } from "@/lib/auditor/fetch"
import { followRedirectsWithValidation } from "@/lib/auditor/ssrf"

export type FetchPageResult =
  | {
      ok: true
      finalUrl: string
      status: number
      html: string
      contentType: string
    }
  | {
      ok: false
      finalUrl: string
      status: number | null
      error: string
      contentType?: string | null
    }

function isTransientError(error: string, status: number | null): boolean {
  if (error === "timeout") return true
  if (status === 429) return true
  if (status !== null && status >= 500) return true
  return false
}

function isHtmlContentType(value: string | null): boolean {
  const ct = String(value || "").toLowerCase()
  if (!ct) return true
  return ct.includes("text/html") || ct.includes("application/xhtml+xml")
}

export async function fetchPageWithRetry(params: {
  url: URL
  timeoutMs: number
  maxBytes: number
  userAgent: string
  retryCount?: number
}): Promise<FetchPageResult> {
  const retryCount = typeof params.retryCount === "number" ? Math.max(0, params.retryCount) : 1

  let currentUrl = params.url
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const redirected = await followRedirectsWithValidation({
      startUrl: currentUrl,
      maxRedirects: 4,
      timeoutMs: Math.min(1_500, params.timeoutMs),
    })
    currentUrl = redirected.finalUrl

    const response = await fetchTextBounded({
      url: currentUrl.toString(),
      timeoutMs: params.timeoutMs,
      maxBytes: params.maxBytes,
      headers: {
        "user-agent": params.userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    })

    if (!response.ok) {
      if (attempt < retryCount && isTransientError(response.error, response.status)) continue
      return {
        ok: false,
        finalUrl: currentUrl.toString(),
        status: response.status,
        error: response.error,
        contentType: null,
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const statusError = `status_${response.status}`
      if (attempt < retryCount && isTransientError(statusError, response.status)) continue
      return {
        ok: false,
        finalUrl: currentUrl.toString(),
        status: response.status,
        error: statusError,
        contentType: response.contentType,
      }
    }

    if (!isHtmlContentType(response.contentType)) {
      return {
        ok: false,
        finalUrl: currentUrl.toString(),
        status: response.status,
        error: "non_html",
        contentType: response.contentType,
      }
    }

    return {
      ok: true,
      finalUrl: currentUrl.toString(),
      status: response.status,
      html: response.text,
      contentType: response.contentType || "text/html",
    }
  }

  return {
    ok: false,
    finalUrl: currentUrl.toString(),
    status: null,
    error: "unknown_fetch_failure",
    contentType: null,
  }
}
