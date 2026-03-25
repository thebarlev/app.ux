import { fetchTextBounded } from "@/lib/auditor/fetch"
import type { SeoIssue, SeoSitemapReport, SeoSitemapUrlCheck } from "@/lib/admin/seo-audit/types"

const BLOCKED_PATH_HINTS = ["/checkout", "/cart", "/account", "/login", "/signin", "/wp-admin"]

function extractLocUrls(xml: string): string[] {
  const urls = new Set<string>()
  const matches = xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)
  for (const match of matches) {
    const value = String(match[1] || "").trim()
    if (!value) continue
    urls.add(value)
  }
  return [...urls]
}

async function checkStatus(url: string, timeoutMs: number): Promise<number | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
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

export async function analyzeSitemap(params: {
  origin: string
  userAgent: string
  timeoutMs: number
  maxChecks?: number
}): Promise<SeoSitemapReport> {
  const sitemapUrl = `${params.origin.replace(/\/+$/, "")}/sitemap.xml`
  const issues: SeoIssue[] = []

  const fetched = await fetchTextBounded({
    url: sitemapUrl,
    timeoutMs: params.timeoutMs,
    maxBytes: 600_000,
    headers: {
      "user-agent": params.userAgent,
      accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
    },
  })

  if (!fetched.ok || fetched.status < 200 || fetched.status >= 300) {
    return {
      fetched: false,
      sitemap_url: sitemapUrl,
      total_urls: 0,
      checked_urls: [],
      issues: [{ severity: "warning", code: "sitemap_unavailable", message: "Could not fetch sitemap.xml." }],
    }
  }

  const urls = extractLocUrls(fetched.text)
  if (urls.length === 0) {
    issues.push({ severity: "warning", code: "sitemap_empty", message: "Sitemap exists but no URLs were found." })
  }

  const checks: SeoSitemapUrlCheck[] = []
  const maxChecks = Math.max(1, Math.min(params.maxChecks || 120, 300))
  for (const url of urls.slice(0, maxChecks)) {
    const status = await checkStatus(url, params.timeoutMs)
    const lower = url.toLowerCase()
    const blocked = BLOCKED_PATH_HINTS.some((hint) => lower.includes(hint))
    checks.push({
      url,
      status,
      blocked_pattern: blocked,
    })
  }

  for (const item of checks) {
    if (item.status === 404) {
      issues.push({ severity: "critical", code: "sitemap_url_404", message: `Sitemap URL returns 404: ${item.url}` })
    } else if (item.status !== null && item.status >= 400) {
      issues.push({ severity: "warning", code: "sitemap_url_error", message: `Sitemap URL returns ${item.status}: ${item.url}` })
    }
    if (item.blocked_pattern) {
      issues.push({
        severity: "warning",
        code: "sitemap_contains_blocked_pattern",
        message: `Sitemap contains likely non-indexable utility URL: ${item.url}`,
      })
    }
  }

  return {
    fetched: true,
    sitemap_url: sitemapUrl,
    total_urls: urls.length,
    checked_urls: checks,
    issues,
  }
}
