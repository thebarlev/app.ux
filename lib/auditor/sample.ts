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
  // High-value paths: pricing, product, faq, blog, contact, about
  if (p.includes("/pricing") || p.includes("/plans")) score += 70
  if (p.includes("/product") || p.includes("/features")) score += 65
  if (p.includes("/faq") || p.includes("/help") || p.includes("/support")) score += 60
  if (p.includes("/blog") || p.includes("/posts") || p.includes("/articles")) score += 55
  if (p.includes("/contact")) score += 50
  if (p.includes("/about")) score += 45
  if (p.includes("/services") || p.includes("/service")) score += 40
  // Shallow paths preferred
  if (p.split("/").filter(Boolean).length <= 1) score += 10
  // Penalty for obvious language variants (e.g. /en, /he) to avoid wasting slots on duplicates
  const segments = p.split("/").filter(Boolean)
  const langSegment = segments[0]
  if (langSegment && /^(en|he|ar|ru)$/i.test(langSegment) && segments.length > 1) score -= 15
  return Math.max(0, score)
}

export function pickSamplePages(params: {
  origin: string
  hostLock: string
  sitemapUrls: string[]
  maxPages?: number
}): string[] {
  const maxPages = typeof params.maxPages === "number" ? params.maxPages : 40

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

