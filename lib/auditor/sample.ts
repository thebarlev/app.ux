const SKIP_EXT_RE = /\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mov|avi|zip|rar|7z|tar|gz|tgz|css|js|map)(\?|#|$)/i

function safeUrlParse(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function scorePath(pathname: string): number {
  const p = pathname.toLowerCase()
  if (p === "/" || p === "") return 100
  let score = 0
  if (p.includes("/services") || p.includes("/service")) score += 60
  if (p.includes("/blog") || p.includes("/posts") || p.includes("/article")) score += 50
  if (p.includes("/contact")) score += 45
  if (p.includes("/about")) score += 40
  if (p.includes("/pricing")) score += 35
  if (p.includes("/faq")) score += 25
  if (p.split("/").filter(Boolean).length <= 1) score += 10
  return score
}

export function pickSamplePages(params: {
  origin: string
  hostLock: string
  sitemapUrls: string[]
  maxPages?: number
}): string[] {
  const maxPages = typeof params.maxPages === "number" ? params.maxPages : 20

  const out: string[] = []
  const seen = new Set<string>()

  const add = (u: string) => {
    if (out.length >= maxPages) return
    const url = safeUrlParse(u)
    if (!url) return
    if (url.protocol !== "http:" && url.protocol !== "https:") return
    if (url.hostname.toLowerCase() !== params.hostLock.toLowerCase()) return
    if (url.port && url.port !== "80" && url.port !== "443") return
    if (SKIP_EXT_RE.test(url.pathname)) return
    const norm = url.toString()
    if (seen.has(norm)) return
    seen.add(norm)
    out.push(norm)
  }

  // Always include homepage first.
  add(`${params.origin}/`)

  const scored = params.sitemapUrls
    .map((u) => {
      const url = safeUrlParse(u)
      if (!url) return null
      return { u: url.toString(), score: scorePath(url.pathname) }
    })
    .filter(Boolean) as Array<{ u: string; score: number }>

  scored.sort((a, b) => b.score - a.score)
  for (const s of scored) add(s.u)

  return out.slice(0, maxPages)
}

export function shouldSkipByExtension(url: string): boolean {
  const u = safeUrlParse(url)
  if (!u) return true
  return SKIP_EXT_RE.test(u.pathname)
}

