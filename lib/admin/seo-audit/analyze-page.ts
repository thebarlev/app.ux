import * as cheerio from "cheerio"
import { canonicalizeUrl } from "@/lib/admin/index-extractor/url-safety"
import type {
  SeoHreflangEntry,
  SeoImageReport,
  SeoIssue,
  SeoPageReport,
  SeoTextTagReport,
} from "@/lib/admin/seo-audit/types"

export type SeoPageIntermediate = {
  page: SeoPageReport
  canonicalValue: string
  hreflangHrefs: string[]
  internalLinks: string[]
}

function isImportantPath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  return p === "/" || p === "" || p.includes("contact") || p.includes("about") || p.includes("service")
}

function normalizeText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function parseMetaReport(value: string, min: number, max: number): SeoTextTagReport {
  const normalized = normalizeText(value)
  const len = normalized.length
  return {
    exists: Boolean(normalized),
    value: normalized,
    length: len,
    too_short: Boolean(normalized) && len < min,
    too_long: len > max,
    duplicate_with: null,
  }
}

function parseSchemaTypes($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>()
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text() || ""
    if (!raw.trim()) return
    try {
      const parsed = JSON.parse(raw)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        const type = (node && (node["@type"] as unknown)) || ""
        if (Array.isArray(type)) {
          for (const t of type) {
            const str = normalizeText(String(t || ""))
            if (str) out.add(str)
          }
        } else {
          const str = normalizeText(String(type || ""))
          if (str) out.add(str)
        }
      }
    } catch {
      // ignore invalid json-ld blocks
    }
  })
  return [...out]
}

function parseImages($: cheerio.CheerioAPI): SeoImageReport {
  let total = 0
  let missingAlt = 0
  $("img").each((_, el) => {
    total += 1
    const alt = $(el).attr("alt")
    if (typeof alt !== "string" || !alt.trim()) missingAlt += 1
  })
  return { total, missing_alt: missingAlt }
}

function parseHreflangEntries($: cheerio.CheerioAPI, pageUrl: URL): SeoHreflangEntry[] {
  const entries: SeoHreflangEntry[] = []
  $("link[rel='alternate'][hreflang]").each((_, el) => {
    const lang = normalizeText(String($(el).attr("hreflang") || ""))
    const hrefRaw = normalizeText(String($(el).attr("href") || ""))
    if (!lang || !hrefRaw) return
    let href = hrefRaw
    let validHref = false
    try {
      href = new URL(hrefRaw, pageUrl).toString()
      validHref = /^https?:\/\//i.test(href)
    } catch {
      validHref = false
    }
    const validLang = /^[a-z]{2}(-[A-Z]{2})?$/.test(lang) || lang.toLowerCase() === "x-default"
    entries.push({
      lang,
      href,
      valid: validLang && validHref,
    })
  })
  return entries
}

function parseInternalLinks($: cheerio.CheerioAPI, pageUrl: URL, rootHost: string): string[] {
  const links = new Set<string>()
  $("a[href]").each((_, el) => {
    const hrefRaw = String($(el).attr("href") || "").trim()
    if (!hrefRaw || hrefRaw.startsWith("#") || hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) return
    try {
      const u = new URL(hrefRaw, pageUrl)
      if (u.hostname.toLowerCase() !== rootHost.toLowerCase()) return
      links.add(canonicalizeUrl(u))
    } catch {
      // ignore
    }
  })
  return [...links]
}

export function analyzePageBase(params: {
  url: string
  finalUrl: string
  status: number
  depth: number
  responseTimeMs: number
  htmlSizeBytes: number
  html: string
  redirectCount: number
  rootHost: string
}): SeoPageIntermediate {
  const issues: SeoIssue[] = []
  const $ = cheerio.load(params.html || "")
  const pageUrl = new URL(params.finalUrl || params.url)

  const canonicalTags = $("link[rel='canonical']")
    .toArray()
    .map((el) => normalizeText(String($(el).attr("href") || "")))
    .filter(Boolean)
  const canonicalValue = canonicalTags[0] ? new URL(canonicalTags[0], pageUrl).toString() : ""
  if (!canonicalValue) {
    issues.push({ severity: "warning", code: "canonical_missing", message: "Canonical tag is missing." })
  }
  if (canonicalTags.length > 1) {
    issues.push({ severity: "warning", code: "canonical_multiple", message: "Multiple canonical tags found." })
  }

  const canonicalMatches = canonicalValue ? canonicalizeUrl(canonicalValue) === canonicalizeUrl(pageUrl) : false
  if (canonicalValue && !canonicalMatches) {
    issues.push({ severity: "warning", code: "canonical_mismatch", message: "Canonical does not match current URL." })
  }

  const robotsMeta = normalizeText(String($("meta[name='robots']").attr("content") || ""))
  const noindex = /\bnoindex\b/i.test(robotsMeta)
  const nofollow = /\bnofollow\b/i.test(robotsMeta)
  if (noindex && isImportantPath(pageUrl.pathname)) {
    issues.push({
      severity: "critical",
      code: "important_noindex",
      message: "Important page is marked as noindex.",
      details: pageUrl.pathname,
    })
  }

  const title = parseMetaReport($("title").first().text(), 10, 60)
  if (!title.exists) issues.push({ severity: "critical", code: "title_missing", message: "Title tag is missing." })
  if (title.too_short) issues.push({ severity: "warning", code: "title_too_short", message: "Title is shorter than recommended." })
  if (title.too_long) issues.push({ severity: "warning", code: "title_too_long", message: "Title is longer than recommended." })

  const description = parseMetaReport(String($("meta[name='description']").attr("content") || ""), 50, 160)
  if (!description.exists) {
    issues.push({ severity: "warning", code: "description_missing", message: "Meta description is missing." })
  } else {
    if (description.too_short) issues.push({ severity: "info", code: "description_too_short", message: "Meta description is short." })
    if (description.too_long) issues.push({ severity: "warning", code: "description_too_long", message: "Meta description is too long." })
  }

  const h1Values = $("h1")
    .toArray()
    .map((el) => normalizeText($(el).text()))
    .filter(Boolean)
  if (h1Values.length === 0) issues.push({ severity: "warning", code: "h1_missing", message: "No H1 heading found." })
  if (h1Values.length > 1) issues.push({ severity: "warning", code: "h1_multiple", message: "Multiple H1 headings found." })

  const schemaTypes = parseSchemaTypes($)
  if (schemaTypes.length === 0) issues.push({ severity: "info", code: "schema_missing", message: "No JSON-LD schema detected." })

  const imageStats = parseImages($)
  if (imageStats.missing_alt > 0) {
    issues.push({
      severity: imageStats.missing_alt > 5 ? "warning" : "info",
      code: "images_missing_alt",
      message: `${imageStats.missing_alt} images are missing alt text.`,
    })
  }

  const hreflangEntries = parseHreflangEntries($, pageUrl)
  const hreflangExists = hreflangEntries.length > 0
  const hreflangValid = hreflangEntries.every((x) => x.valid)
  if (hreflangExists && !hreflangValid) {
    issues.push({ severity: "warning", code: "hreflang_invalid", message: "Some hreflang tags are invalid." })
  }
  const hasHeIl = hreflangEntries.some((x) => x.lang.toLowerCase() === "he-il")
  const hasEn = hreflangEntries.some((x) => x.lang.toLowerCase() === "en")

  const internalLinks = parseInternalLinks($, pageUrl, params.rootHost)
  const possibleLoop = params.redirectCount > 4
  if (possibleLoop) {
    issues.push({ severity: "warning", code: "redirect_chain_long", message: "Long redirect chain detected." })
  }

  const page: SeoPageReport = {
    url: pageUrl.toString(),
    isMoneyPage: false,
    status: params.status,
    depth: params.depth,
    response_time_ms: params.responseTimeMs,
    html_size_bytes: params.htmlSizeBytes,
    canonical: {
      exists: Boolean(canonicalValue),
      count: canonicalTags.length,
      value: canonicalValue,
      matches_page_url: canonicalMatches,
      duplicate_with: null,
    },
    hreflang: {
      exists: hreflangExists,
      valid_structure: hreflangValid,
      has_he_il: hasHeIl,
      has_en: hasEn,
      reciprocal_ok: true,
      entries: hreflangEntries,
    },
    robots: {
      meta: robotsMeta,
      noindex,
      nofollow,
      potentially_incorrect_noindex: noindex && isImportantPath(pageUrl.pathname),
    },
    title,
    description,
    h1: {
      count: h1Values.length,
      values: h1Values.slice(0, 5),
    },
    schemaTypes,
    images: imageStats,
    internalLinks: {
      total: internalLinks.length,
      unique_internal: internalLinks.length,
      broken_internal_count: 0,
      broken_internal_urls: [],
    },
    redirect: {
      redirect_count: params.redirectCount,
      has_chain: params.redirectCount > 1,
      possible_loop: possibleLoop,
      final_url: pageUrl.toString(),
    },
    issues,
  }

  return {
    page,
    canonicalValue,
    hreflangHrefs: hreflangEntries.map((x) => x.href),
    internalLinks,
  }
}
