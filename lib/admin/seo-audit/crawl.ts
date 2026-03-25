import * as cheerio from "cheerio"
import { followRedirectsWithValidation } from "@/lib/auditor/ssrf"
import { fetchPageWithRetry } from "@/lib/admin/index-extractor/fetch-page"
import { canCrawlUrlByRobots } from "@/lib/admin/index-extractor/robots"
import { canonicalizeUrl, isLikelyBinaryPath, validatePublicHttpUrl } from "@/lib/admin/index-extractor/url-safety"
import { analyzePageBase } from "@/lib/admin/seo-audit/analyze-page"
import { analyzeSitemap } from "@/lib/admin/seo-audit/analyze-sitemap"
import { buildActionableRecommendations } from "@/lib/admin/seo-audit/recommendations"
import { computeSeoScore } from "@/lib/admin/seo-audit/scoring"
import { SEO_AUDIT_DEFAULT_OPTIONS } from "@/lib/admin/seo-audit/types"
import type { SeoAuditResponse, SeoAuditRunOptions, SeoCrawlPage, SeoCrawlResult, SeoIssue, SeoPageReport } from "@/lib/admin/seo-audit/types"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeHost(hostname: string): string {
  return String(hostname || "").toLowerCase().replace(/^www\./, "")
}

function isSameDomain(a: string, b: string): boolean {
  return normalizeHost(a) === normalizeHost(b)
}

function normalizeAuditInputUrl(rawInput: string): URL {
  const raw = String(rawInput || "").trim()
  if (!raw) throw new Error("missing_url")
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  const url = new URL(withScheme)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid_protocol")
  if (url.username || url.password) throw new Error("credentials_not_allowed")
  return url
}

function isLocalDevHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase()
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1"
}

async function resolveAuditRootUrl(rawInput: string): Promise<URL> {
  const url = normalizeAuditInputUrl(rawInput)
  const allowLocal = process.env.NODE_ENV !== "production" || process.env.SEO_AUDIT_ALLOW_LOCALHOST === "1"
  if (allowLocal && isLocalDevHost(url.hostname)) {
    return url
  }
  return validatePublicHttpUrl(url.toString())
}

function extractInternalLinks(html: string, baseUrl: URL, rootHost: string): string[] {
  const $ = cheerio.load(html || "")
  const links = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim()
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      return
    }
    try {
      const url = new URL(href, baseUrl)
      if (!isSameDomain(url.hostname, rootHost)) return
      if (isLikelyBinaryPath(url.pathname)) return
      links.add(canonicalizeUrl(url))
    } catch {
      // ignore bad urls
    }
  })
  return [...links]
}

function detectMoneyPage(url: string): boolean {
  try {
    const p = (new URL(url).pathname || "/").toLowerCase()
    return p === "/" || p === "/seo-ai" || p === "/en/seo-ai" || p.includes("service") || p.includes("landing")
  } catch {
    return false
  }
}

function mergeRunOptions(input: Partial<SeoAuditRunOptions> & { maxPages?: number }): SeoAuditRunOptions {
  const maxPages = Number.isFinite(input.maxPages) ? Math.max(1, Math.min(50, Math.floor(Number(input.maxPages)))) : SEO_AUDIT_DEFAULT_OPTIONS.maxPages
  return {
    maxPages,
    maxRuntimeMs: Number.isFinite(input.maxRuntimeMs)
      ? Math.max(20_000, Math.min(120_000, Math.floor(Number(input.maxRuntimeMs))))
      : SEO_AUDIT_DEFAULT_OPTIONS.maxRuntimeMs,
    fetchTimeoutMs: Number.isFinite(input.fetchTimeoutMs)
      ? Math.max(3_000, Math.min(12_000, Math.floor(Number(input.fetchTimeoutMs))))
      : SEO_AUDIT_DEFAULT_OPTIONS.fetchTimeoutMs,
    maxHtmlBytes: Number.isFinite(input.maxHtmlBytes)
      ? Math.max(300_000, Math.min(2_000_000, Math.floor(Number(input.maxHtmlBytes))))
      : SEO_AUDIT_DEFAULT_OPTIONS.maxHtmlBytes,
    userAgent: input.userAgent || SEO_AUDIT_DEFAULT_OPTIONS.userAgent,
  }
}

async function probeStatus(url: string): Promise<number | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 3_500)
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal })
    if (res.status === 405) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ac.signal })
    }
    try {
      res.body?.cancel()
    } catch {
      // ignore
    }
    return res.status
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function crawlSiteForSeo(params: {
  rootUrl: string
  options: SeoAuditRunOptions
}): Promise<SeoCrawlResult> {
  const startedAt = Date.now()
  const root = await resolveAuditRootUrl(params.rootUrl)
  const rootHost = root.hostname
  const queue: Array<{ url: URL; depth: number }> = [{ url: root, depth: 0 }]
  const visited = new Set<string>()
  const discovered = new Set<string>([canonicalizeUrl(root)])
  const pages: SeoCrawlPage[] = []
  let stopReason: SeoCrawlResult["stopReason"]

  while (queue.length > 0) {
    if (pages.length >= params.options.maxPages) {
      stopReason = "max_pages"
      break
    }
    if (Date.now() - startedAt >= params.options.maxRuntimeMs) {
      stopReason = "max_runtime"
      break
    }

    const next = queue.shift()
    if (!next) break
    const canonical = canonicalizeUrl(next.url)
    if (visited.has(canonical)) continue
    visited.add(canonical)

    if (!isSameDomain(next.url.hostname, rootHost)) continue
    if (isLikelyBinaryPath(next.url.pathname)) continue

    const robots = await canCrawlUrlByRobots({
      pageUrl: next.url,
      userAgent: params.options.userAgent,
      timeoutMs: 1_500,
    })
    if (!robots.allowed) continue

    let redirectCount = 0
    let candidateUrl = next.url
    try {
      const redir = await followRedirectsWithValidation({
        startUrl: next.url,
        maxRedirects: 5,
        timeoutMs: 1_500,
      })
      redirectCount = redir.redirects.length
      candidateUrl = redir.finalUrl
    } catch {
      // keep original URL if redirect probing fails
    }

    if (!isSameDomain(candidateUrl.hostname, rootHost)) continue

    const t0 = Date.now()
    const fetched = await fetchPageWithRetry({
      url: candidateUrl,
      timeoutMs: params.options.fetchTimeoutMs,
      maxBytes: params.options.maxHtmlBytes,
      userAgent: params.options.userAgent,
      retryCount: 1,
    })
    const responseTimeMs = Date.now() - t0

    if (!fetched.ok) {
      continue
    }

    const finalUrl = new URL(fetched.finalUrl)
    if (!isSameDomain(finalUrl.hostname, rootHost)) continue

    const page: SeoCrawlPage = {
      url: canonical,
      finalUrl: finalUrl.toString(),
      status: fetched.status,
      html: fetched.html,
      depth: next.depth,
      responseTimeMs,
      htmlSizeBytes: Buffer.byteLength(fetched.html, "utf-8"),
      redirectCount,
    }
    pages.push(page)

    const links = extractInternalLinks(fetched.html, finalUrl, rootHost)
    for (const link of links) {
      discovered.add(link)
      if (visited.has(link)) continue
      if (queue.length >= params.options.maxPages * 3) break
      queue.push({ url: new URL(link), depth: next.depth + 1 })
    }

    await sleep(120)
  }

  return {
    pages,
    discoveredUrls: [...discovered],
    stopReason,
  }
}

export async function runSeoAudit(params: {
  url: string
  options?: Partial<SeoAuditRunOptions> & { maxPages?: number }
}): Promise<SeoAuditResponse> {
  const options = mergeRunOptions(params.options || {})
  const root = await resolveAuditRootUrl(params.url)
  const crawled = await crawlSiteForSeo({
    rootUrl: root.toString(),
    options,
  })

  const intermediates = crawled.pages.map((page) =>
    analyzePageBase({
      url: page.url,
      finalUrl: page.finalUrl,
      status: page.status,
      depth: page.depth,
      responseTimeMs: page.responseTimeMs,
      htmlSizeBytes: page.htmlSizeBytes,
      html: page.html,
      redirectCount: page.redirectCount,
      rootHost: root.hostname,
    })
  )

  const pages: SeoPageReport[] = intermediates.map((x) => x.page)
  for (const page of pages) {
    page.isMoneyPage = detectMoneyPage(page.url)
  }
  const issuesGlobal: SeoIssue[] = []
  const byCanonical = new Map<string, string[]>()
  const byTitle = new Map<string, string[]>()
  const byDescription = new Map<string, string[]>()
  const pageByUrl = new Map<string, SeoPageReport>()

  for (const page of pages) {
    pageByUrl.set(canonicalizeUrl(page.url), page)
    if (page.canonical.value) {
      const key = canonicalizeUrl(page.canonical.value)
      byCanonical.set(key, [...(byCanonical.get(key) || []), page.url])
    }
    if (page.title.value) {
      const key = page.title.value.toLowerCase()
      byTitle.set(key, [...(byTitle.get(key) || []), page.url])
    }
    if (page.description.value) {
      const key = page.description.value.toLowerCase()
      byDescription.set(key, [...(byDescription.get(key) || []), page.url])
    }
  }

  for (const page of pages) {
    if (page.canonical.value) {
      const dup = byCanonical.get(canonicalizeUrl(page.canonical.value)) || []
      if (dup.length > 1) {
        page.canonical.duplicate_with = dup.find((u) => u !== page.url) || null
        page.issues.push({
          severity: "warning",
          code: "canonical_duplicate",
          message: "Canonical URL is shared by multiple pages.",
        })
      }
    }
    if (page.title.value) {
      const dup = byTitle.get(page.title.value.toLowerCase()) || []
      if (dup.length > 1) {
        page.title.duplicate_with = dup.find((u) => u !== page.url) || null
        page.issues.push({ severity: "warning", code: "title_duplicate", message: "Duplicate title detected." })
      }
    }
    if (page.description.value) {
      const dup = byDescription.get(page.description.value.toLowerCase()) || []
      if (dup.length > 1) {
        page.description.duplicate_with = dup.find((u) => u !== page.url) || null
        page.issues.push({ severity: "info", code: "description_duplicate", message: "Duplicate description detected." })
      }
    }
  }

  const multilingualSite = pages.some((p) => p.hreflang.exists)
  for (const page of pages) {
    if (multilingualSite && page.hreflang.exists && (!page.hreflang.has_he_il || !page.hreflang.has_en)) {
      page.issues.push({
        severity: "info",
        code: "hreflang_missing_he_or_en",
        message: "Hreflang exists but does not include both he-IL and en.",
      })
    }

    let reciprocalOk = true
    for (const entry of page.hreflang.entries) {
      const target = pageByUrl.get(canonicalizeUrl(entry.href))
      if (!target) continue
      const hasBack = target.hreflang.entries.some((x) => canonicalizeUrl(x.href) === canonicalizeUrl(page.url))
      if (!hasBack) {
        reciprocalOk = false
        page.issues.push({
          severity: "warning",
          code: "hreflang_no_reciprocal",
          message: `Hreflang target does not point back: ${entry.href}`,
        })
      }
    }
    page.hreflang.reciprocal_ok = reciprocalOk
  }

  const statusCache = new Map<string, number | null>()
  for (const p of pages) {
    statusCache.set(canonicalizeUrl(p.url), p.status)
  }
  for (let i = 0; i < intermediates.length; i++) {
    const inter = intermediates[i]
    const page = pages[i]
    const broken = new Set<string>()
    for (const link of inter.internalLinks.slice(0, 50)) {
      const key = canonicalizeUrl(link)
      let status = statusCache.get(key)
      if (typeof status !== "number") {
        status = await probeStatus(link)
        statusCache.set(key, status)
      }
      if (status !== null && status >= 400) broken.add(link)
    }
    page.internalLinks.broken_internal_urls = [...broken].slice(0, 20)
    page.internalLinks.broken_internal_count = broken.size
    if (broken.size > 0) {
      page.issues.push({
        severity: "warning",
        code: "internal_broken_links",
        message: `${broken.size} internal links return 4xx/5xx.`,
      })
    }
  }

  const sitemap = await analyzeSitemap({
    origin: root.origin,
    userAgent: options.userAgent,
    timeoutMs: options.fetchTimeoutMs,
    maxChecks: 120,
  })
  issuesGlobal.push(...sitemap.issues)
  if (crawled.stopReason) {
    issuesGlobal.push({
      severity: "info",
      code: "crawl_stop_reason",
      message: `Crawler stopped due to ${crawled.stopReason}.`,
    })
  }

  const allIssues = [...issuesGlobal, ...pages.flatMap((p) => p.issues)]
  const criticalIssues = allIssues.filter((issue) => issue.severity === "critical")
  const warnings = allIssues.filter((issue) => issue.severity === "warning")
  const recommendationPack = buildActionableRecommendations({
    pages,
    globalIssues: issuesGlobal,
  })
  const score = computeSeoScore({
    pages,
    globalIssues: issuesGlobal,
  })

  return {
    summary: {
      score: score.score,
      pagesScanned: pages.length,
      issues: allIssues.length,
      breakdown: score.breakdown,
    },
    pages,
    sitemap,
    criticalIssues,
    warnings,
    recommendations: recommendationPack.recommendations,
    growthOpportunities: recommendationPack.growthOpportunities,
    quickWins: recommendationPack.quickWins,
    biggestIssues: recommendationPack.biggestIssues,
  }
}
