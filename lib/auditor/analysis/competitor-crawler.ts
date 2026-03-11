import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchTextBounded } from "../fetch"
import { parseSitemapXml } from "../sitemap"
import { pickSamplePages, shouldSkipByExtension } from "../sample"
import { followRedirectsWithValidation, normalizeInputUrl } from "../ssrf"
import { extractPageContent } from "./content-extract"

type CompetitorRow = {
  id: string
  domain: string
}

function safeUrlPath(u: string): string | null {
  try {
    return new URL(u).pathname || "/"
  } catch {
    return null
  }
}

function parseRobotsSitemaps(text: string, origin: string): string[] {
  const out: string[] = []
  for (const line of String(text || "").split(/\r?\n/g)) {
    const match = line.match(/^\s*sitemap\s*:\s*(.+)\s*$/i)
    if (!match) continue
    try {
      out.push(new URL(String(match[1] || "").trim(), origin).toString())
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(out))
}

function classifyPageType(url: string): "homepage" | "service" | "blog" | "page" {
  const path = String(safeUrlPath(url) || "").toLowerCase()
  if (path === "/" || path === "") return "homepage"
  if (path.includes("/blog") || path.includes("/post") || path.includes("/article")) return "blog"
  if (path.includes("/service") || path.includes("/solutions") || path.includes("/product")) return "service"
  return "page"
}

export async function crawlCompetitorPages(params: {
  supabase: SupabaseClient
  scanId: string
}) {
  const { supabase, scanId } = params
  const { data: competitors, error: competitorsError } = await supabase
    .from("auditor_competitors")
    .select("id,domain")
    .eq("scan_id", scanId)
    .order("confidence", { ascending: false })
    .limit(3)
  if (competitorsError) throw new Error(`crawlCompetitorPages competitors query failed: ${competitorsError.message}`)

  const rows = (competitors || []) as CompetitorRow[]
  const { error: deleteError } = await supabase.from("auditor_competitor_pages").delete().eq("scan_id", scanId)
  if (deleteError) throw new Error(`crawlCompetitorPages delete failed: ${deleteError.message}`)

  const insertedPages: Array<{ competitorId: string; url: string }> = []

  for (const competitor of rows) {
    let origin = `https://${competitor.domain}`
    let hostLock = competitor.domain
    try {
      const startUrl = normalizeInputUrl(origin)
      const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 4, timeoutMs: 1500 })
      origin = finalUrl.origin.replace(/\/+$/, "")
      hostLock = finalUrl.hostname
    } catch {
      continue
    }

    const robots = await fetchTextBounded({ url: `${origin}/robots.txt`, timeoutMs: 1200, maxBytes: 150_000 })
    const sitemapHints = robots.ok ? parseRobotsSitemaps(robots.text, origin) : []
    const sitemapUrl = sitemapHints[0] || `${origin}/sitemap.xml`
    const sitemapRes = await fetchTextBounded({ url: sitemapUrl, timeoutMs: 1500, maxBytes: 800_000 })

    let sitemapUrls: string[] = []
    if (sitemapRes.ok && sitemapRes.status >= 200 && sitemapRes.status < 300) {
      const parsed = parseSitemapXml(sitemapRes.text)
      sitemapUrls = parsed.urls
      if (parsed.childSitemaps.length > 0) {
        const child = await fetchTextBounded({ url: parsed.childSitemaps[0], timeoutMs: 1500, maxBytes: 800_000 })
        if (child.ok && child.status >= 200 && child.status < 300) {
          sitemapUrls = [...sitemapUrls, ...parseSitemapXml(child.text).urls]
        }
      }
    }

    const sampleUrls = pickSamplePages({
      origin,
      hostLock,
      sitemapUrls: sitemapUrls.filter((url) => !shouldSkipByExtension(url)),
      maxPages: 4,
    })

    for (const url of sampleUrls) {
      const res = await fetchTextBounded({
        url,
        timeoutMs: 2500,
        maxBytes: 500_000,
        headers: { "user-agent": "VOW-Auditor-Competitor/1.0" },
      })

      const contentType = res.ok ? res.contentType : null
      const isHtml = contentType ? contentType.toLowerCase().includes("text/html") : true

      if (!res.ok || res.status < 200 || res.status >= 300 || !isHtml) {
        const { error: insertError } = await supabase.from("auditor_competitor_pages").insert({
          scan_id: scanId,
          competitor_id: competitor.id,
          url,
          path: safeUrlPath(url),
          page_type: classifyPageType(url),
          state: res.ok && !isHtml ? "skipped" : "failed",
          status_code: res.ok ? res.status : null,
          error: res.ok ? (isHtml ? null : "non_html") : res.error,
          fetched_at: new Date().toISOString(),
        })
        if (insertError) throw new Error(`crawlCompetitorPages failed-page insert failed: ${insertError.message}`)
        continue
      }

      const content = extractPageContent(res.text)
      const contentRecord = {
        title: content.title,
        headings: content.headings,
        paragraphs: content.paragraphs,
        links: content.links,
        entities: content.entities,
        wordCount: content.paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
      }

      const { data: inserted, error: insertedError } = await supabase
        .from("auditor_competitor_pages")
        .insert({
          scan_id: scanId,
          competitor_id: competitor.id,
          url,
          path: safeUrlPath(url),
          page_type: classifyPageType(url),
          state: "extracted",
          status_code: res.status,
          title: content.title,
          content: contentRecord,
          fetched_at: new Date().toISOString(),
          extracted_at: new Date().toISOString(),
        })
        .select("competitor_id,url")
        .single()
      if (insertedError) throw new Error(`crawlCompetitorPages extracted-page insert failed: ${insertedError.message}`)

      if (inserted) insertedPages.push({ competitorId: inserted.competitor_id, url: inserted.url })
    }
  }

  return insertedPages
}
