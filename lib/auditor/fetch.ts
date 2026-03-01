export type FetchTextResult =
  | {
      ok: true
      status: number
      url: string
      contentType: string | null
      headers: Record<string, string>
      bytes: number
      text: string
      elapsedMs: number
    }
  | {
      ok: false
      status: number | null
      url: string
      error: string
      elapsedMs: number
    }

export async function fetchTextBounded(params: {
  url: string
  method?: "GET" | "HEAD"
  timeoutMs: number
  maxBytes: number
  headers?: Record<string, string>
}): Promise<FetchTextResult> {
  const started = Date.now()
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), params.timeoutMs)
  try {
    const res = await fetch(params.url, {
      method: params.method ?? "GET",
      redirect: "manual",
      headers: params.headers,
      signal: ac.signal,
    })

    const contentType = res.headers.get("content-type")
    const headers: Record<string, string> = {}
    for (const [k, v] of res.headers.entries()) {
      const key = String(k || "").toLowerCase()
      if (!key) continue
      // Keep a small, safe subset by default.
      if (key === "content-type" || key === "x-robots-tag" || key === "cache-control" || key === "server") {
        headers[key] = String(v || "").slice(0, 500)
      }
    }
    const status = res.status

    if (params.method === "HEAD") {
      return {
        ok: true,
        status,
        url: params.url,
        contentType,
        headers,
        bytes: 0,
        text: "",
        elapsedMs: Date.now() - started,
      }
    }

    const reader = res.body?.getReader()
    if (!reader) {
      return {
        ok: false,
        status,
        url: params.url,
        error: "missing_body",
        elapsedMs: Date.now() - started,
      }
    }

    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > params.maxBytes) {
          try {
            await reader.cancel()
          } catch {
            // ignore
          }
          return {
            ok: false,
            status,
            url: params.url,
            error: "max_bytes_exceeded",
            elapsedMs: Date.now() - started,
          }
        }
        chunks.push(value)
      }
    }

    const buf = Buffer.concat(chunks as readonly Uint8Array[])
    const text = buf.toString("utf-8")
    return {
      ok: true,
      status,
      url: params.url,
      contentType,
      headers,
      bytes: total,
      text,
      elapsedMs: Date.now() - started,
    }
  } catch (e: any) {
    return {
      ok: false,
      status: null,
      url: params.url,
      error: e?.name === "AbortError" ? "timeout" : String(e?.message || e),
      elapsedMs: Date.now() - started,
    }
  } finally {
    clearTimeout(t)
  }
}

