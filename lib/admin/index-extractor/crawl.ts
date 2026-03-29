import * as cheerio from "cheerio"
import pLimit from "p-limit"
import { normalizeAndClassifyPhone } from "@/lib/admin/index-extractor/normalize-phone"
import { getAdapterForHostname } from "@/lib/admin/index-extractor/adapters"
import { dedupeRows } from "@/lib/admin/index-extractor/dedupe"
import { fetchPageWithRetry } from "@/lib/admin/index-extractor/fetch-page"
import { scoreLeadForRow } from "@/lib/admin/index-extractor/lead-scoring"
import { canCrawlUrlByRobots } from "@/lib/admin/index-extractor/robots"
import {
  canonicalizeUrl,
  evaluateDomainPolicy,
  isLikelyBinaryPath,
  validatePublicHttpUrl,
} from "@/lib/admin/index-extractor/url-safety"
import type { CrawlError, CrawlSkipped, ExtractedRow, PageDebugInfo, RunInput, RunResult, RuntimeCaps, SourceInput } from "./types"

const DEFAULT_CRAWL_DELAY_MS = 400
const FETCH_MAX_BYTES = 800_000
const USER_AGENT = "VOW-Index-Extractor/1.0 (+https://app.uxellent.com)"
const INTERNAL_LINK_POSITIVE_HINTS = ["contact", "about", "team", "staff", "company", "services", "location", "branch", "support"]
const INTERNAL_LINK_NEGATIVE_HINTS = [
  "/search",
  "/tag",
  "/category",
  "/page/",
  "/login",
  "/account",
  "/cart",
  "/checkout",
  "/privacy",
  "/terms",
  "/policy",
]
const CONTACT_PATH_CANDIDATES = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/staff", "/people", "/our-team"]
const PAGINATION_HINTS = ["?page=", "&page=", "/page/", "rel=\"next\""]
const DETAIL_HINTS = ["/profile", "/person", "/people/", "/team/", "/staff/", "/listing/", "/member/"]
const SCRIPT_PHONE_REGEX = /(?:\+?\d[\d\s()./-]{7,}\d)/g

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toRow(params: {
  source: SourceInput
  sourceDomain: string
  pageUrl: string
  fields: Record<string, unknown>
}): ExtractedRow {
  const score = Number(params.fields.confidence_score || 0)
  const normalizedScore = Math.max(0, Math.min(1, score || 0.5))

  const row: ExtractedRow = {
    source_url: params.source.sourceUrl,
    source_domain: params.sourceDomain,
    page_url: params.pageUrl,
    page_title: String(params.fields.page_title || ""),
    full_name: String(params.fields.full_name || ""),
    first_name: String(params.fields.first_name || ""),
    last_name: String(params.fields.last_name || ""),
    business_name: String(params.fields.business_name || ""),
    phone: String(params.fields.phone || ""),
    mobile: String(params.fields.mobile || ""),
    email: String(params.fields.email || ""),
    website: String(params.fields.website || ""),
    address: String(params.fields.address || ""),
    city: String(params.fields.city || ""),
    category: String(params.fields.category || ""),
    notes: String(params.fields.notes || ""),
    extraction_method: String(params.fields.extraction_method || "static_html"),
    extracted_at: new Date().toISOString(),
    status: "partial",
    confidence_score: normalizedScore.toFixed(2),
  }

  const contactSignals =
    Number(Boolean(row.email)) +
    Number(Boolean(row.phone || row.mobile)) +
    Number(Boolean(row.full_name))
  const businessSignals =
    Number(Boolean(row.business_name)) +
    Number(Boolean(row.page_title)) +
    Number(Boolean(row.website)) +
    Number(Boolean(row.category)) +
    Number(Boolean(row.address || row.city))

  if (contactSignals >= 2 || contactSignals + businessSignals >= 5) {
    row.status = "success"
  } else if (contactSignals >= 1 || businessSignals >= 2) {
    row.status = "partial"
  } else {
    row.status = "failed"
  }
  return row
}

function discoverInternalLinks(html: string, baseUrl: URL, hostLock: string): string[] {
  const $ = cheerio.load(html || "")
  const links: string[] = []
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim()
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
    try {
      const resolved = new URL(href, baseUrl)
      if (resolved.hostname.toLowerCase() !== hostLock.toLowerCase()) return
      if (isLikelyBinaryPath(resolved.pathname)) return
      links.push(canonicalizeUrl(resolved))
    } catch {
      // ignore invalid links
    }
  })
  return Array.from(new Set(links))
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function scoreInternalLink(url: string): number {
  const lower = url.toLowerCase()
  let score = 0
  if (INTERNAL_LINK_POSITIVE_HINTS.some((hint) => lower.includes(hint))) score += 5
  if (PAGINATION_HINTS.some((hint) => lower.includes(hint))) score += 4
  if (DETAIL_HINTS.some((hint) => lower.includes(hint))) score += 6
  if (INTERNAL_LINK_NEGATIVE_HINTS.some((hint) => lower.includes(hint))) score -= 8
  if (lower.split("/").length <= 5) score += 1
  return score
}

function selectHighValueInternalLinks(urls: string[], maxItems: number): string[] {
  if (maxItems <= 0) return []
  return [...urls]
    .sort((a, b) => scoreInternalLink(b) - scoreInternalLink(a))
    .filter((url) => scoreInternalLink(url) > -4)
    .slice(0, maxItems)
}

function queueContactPathFallbacks(params: {
  base: URL
  queue: Array<{ url: URL; depth: number }>
  seenPathSet: Set<string>
  maxAdds: number
}) {
  let added = 0
  for (const path of CONTACT_PATH_CANDIDATES) {
    if (added >= params.maxAdds) break
    if (params.seenPathSet.has(path)) continue
    params.seenPathSet.add(path)
    const url = new URL(path, params.base.origin)
    params.queue.push({ url, depth: 1 })
    added += 1
  }
}

function countFieldsFound(fields: Record<string, unknown>): number {
  const keys = [
    "page_title",
    "full_name",
    "first_name",
    "last_name",
    "business_name",
    "phone",
    "mobile",
    "email",
    "website",
    "address",
    "city",
    "category",
  ]
  return keys.reduce((count, key) => count + Number(Boolean(String(fields[key] || "").trim())), 0)
}

function parseDebugEntries(entries: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(entries)) return out
  for (const item of entries) {
    const value = String(item || "")
    const sep = value.indexOf("=")
    if (sep <= 0) continue
    const key = value.slice(0, sep).trim()
    const val = value.slice(sep + 1).trim()
    if (!key) continue
    out[key] = val
  }
  return out
}

function isWeakExtraction(fields: Record<string, unknown>): boolean {
  const email = String(fields.email || "").trim()
  const phoneOrMobile = String(fields.phone || fields.mobile || "").trim()
  // Trigger contact-path probing whenever direct contact methods are missing,
  // even if site-profile fields (business_name/title) were extracted.
  return !email && !phoneOrMobile
}

type ContactRecord = Record<string, unknown>

function createContactRowFields(base: Record<string, unknown>, contact: ContactRecord): Record<string, unknown> {
  const notes = [String(base.notes || ""), String(contact.notes || ""), "row_source=multi_contact"].filter(Boolean).join("; ")
  return {
    ...base,
    full_name: contact.full_name || base.full_name || "",
    business_name: contact.business_name || base.business_name || "",
    // Keep page-level contact signals when a block-level contact is partial.
    email: contact.email || base.email || "",
    phone: contact.phone || base.phone || "",
    mobile: contact.mobile || base.mobile || "",
    address: contact.address || base.address || "",
    city: contact.city || base.city || "",
    category: contact.category || base.category || "",
    extraction_method: contact.extraction_method || base.extraction_method || "static_html",
    confidence_score: typeof contact.confidence_score === "number" ? contact.confidence_score : base.confidence_score,
    notes,
  }
}

function toBool(value: string | undefined): boolean | null {
  if (value === "1") return true
  if (value === "0") return false
  return null
}

function getSourceSearchMeta(source: SourceInput): {
  search_source: PageDebugInfo["search_source"]
  search_engine: PageDebugInfo["search_engine"]
  search_query: string | null
  search_rank: number | null
} {
  return {
    search_source: source.sourceMeta?.search_source || null,
    search_engine: source.sourceMeta?.search_engine || null,
    search_query: source.sourceMeta?.search_query || null,
    search_rank: typeof source.sourceMeta?.search_rank === "number" ? source.sourceMeta.search_rank : null,
  }
}

function inferDialPrefixFromHostname(hostname: string): string {
  const host = String(hostname || "").toLowerCase()
  if (!host) return ""
  if (host.endsWith(".il") || host.endsWith(".co.il")) return "+972"
  if (host.endsWith(".us") || host.endsWith(".ca")) return "+1"
  if (host.endsWith(".au")) return "+61"
  if (host.endsWith(".nz")) return "+64"
  if (host.endsWith(".uk")) return "+44"
  return ""
}

function applyCountryPrefixForUrl(value: string, pageUrl: URL): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.startsWith("+")) return raw
  const digits = raw.replace(/[^\d]/g, "")
  if (!digits) return ""
  if (digits.startsWith("00")) return `+${digits.slice(2)}`

  const prefix = inferDialPrefixFromHostname(pageUrl.hostname)
  if (prefix === "+972") return digits.startsWith("0") ? `+972${digits.slice(1)}` : digits.startsWith("972") ? `+${digits}` : `+972${digits}`
  if (prefix === "+1") return digits.length === 10 ? `+1${digits}` : digits.startsWith("1") ? `+${digits}` : `+1${digits.replace(/^0+/, "")}`
  if (prefix === "+61") return digits.startsWith("61") ? `+${digits}` : `+61${digits.replace(/^0+/, "")}`
  if (prefix === "+64") return digits.startsWith("64") ? `+${digits}` : `+64${digits.replace(/^0+/, "")}`
  if (prefix === "+44") return digits.startsWith("44") ? `+${digits}` : `+44${digits.replace(/^0+/, "")}`

  if (digits.length === 10 && !digits.startsWith("0")) return `+1${digits}`
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `+972${digits.slice(1)}`
  return `+${digits}`
}

function extractPhonesFromTextChunk(content: string): string[] {
  const matches = String(content || "").match(SCRIPT_PHONE_REGEX) || []
  const out = new Set<string>()
  for (const item of matches) {
    const raw = String(item || "").replace(/\s+/g, " ").trim()
    const digits = raw.replace(/[^\d]/g, "")
    if (digits.length < 7 || digits.length > 12) continue
    if (/\d+\.\d+-\d+/.test(raw)) continue
    if (/\d{1,2}\.\d{1,2}\.\d{2,4}/.test(raw)) continue
    const normalized = normalizeAndClassifyPhone(raw)
    const phone = normalized.mobile || normalized.phone || normalized.normalized || raw
    if (phone) out.add(phone)
  }
  return [...out]
}

async function extractPhonesFromSameDomainScripts(params: { html: string; baseUrl: URL; userAgent: string }): Promise<string[]> {
  const $ = cheerio.load(params.html || "")
  const scriptUrls: string[] = []
  $("script[src]").each((_, el) => {
    const rawSrc = String($(el).attr("src") || "").trim()
    if (!rawSrc) return
    try {
      const resolved = new URL(rawSrc, params.baseUrl)
      if (resolved.hostname.toLowerCase() !== params.baseUrl.hostname.toLowerCase()) return
      scriptUrls.push(resolved.toString())
    } catch {
      // ignore invalid script src
    }
  })

  const uniqueScripts = [...new Set(scriptUrls)].slice(0, 4)
  const collected = new Set<string>()
  for (const scriptUrl of uniqueScripts) {
    try {
      const res = await fetch(scriptUrl, {
        method: "GET",
        headers: {
          "user-agent": params.userAgent,
          accept: "*/*",
        },
      })
      if (!res.ok) continue
      const text = await res.text()
      for (const phone of extractPhonesFromTextChunk(text)) {
        collected.add(phone)
      }
    } catch {
      // ignore script fetch failures
    }
  }
  return [...collected]
}

export async function runIndexExtraction(params: {
  input: RunInput
  caps: RuntimeCaps
}): Promise<RunResult> {
  const startedAt = Date.now()
  const rows: ExtractedRow[] = []
  const errors: CrawlError[] = []
  const skipped: CrawlSkipped[] = []
  const pageDebug: PageDebugInfo[] = []
  const visited = new Set<string>()
  const limit = pLimit(2)
  let totalPagesAttempted = 0
  let stoppedReason: "runtime_limit" | "page_limit" | undefined

  const maxPagesRequested = Math.max(1, Math.floor(params.input.maxPagesToVisit || params.caps.maxTotalPages))
  const maxTotalPages = Math.min(maxPagesRequested, params.caps.maxTotalPages)
  const sources = params.input.sources.slice(0, params.caps.maxSeeds)
  const followInternal = Boolean(params.input.followInternalLinks)
  const mode = params.input.mode || "manual"
  const internalLinkMaxDepth = clampInt(params.input.internalLinkMaxDepth, 1, 0, 2)
  const internalLinkMaxPagesPerDomain = clampInt(params.input.internalLinkMaxPagesPerDomain, 2, 0, 5)
  const enableInternalExpansion =
    mode === "google_search" && followInternal && internalLinkMaxDepth > 0 && internalLinkMaxPagesPerDomain > 0
  const useRenderedFallback = Boolean(params.input.useRenderedFallback)

  const shouldStop = () => {
    if (Date.now() - startedAt >= params.caps.maxRuntimeMs) {
      stoppedReason = "runtime_limit"
      return true
    }
    if (totalPagesAttempted >= maxTotalPages) {
      stoppedReason = "page_limit"
      return true
    }
    return false
  }

  for (const source of sources) {
    if (shouldStop()) break
    const sourceSearchMeta = getSourceSearchMeta(source)

    let normalizedSource: URL
    try {
      normalizedSource = await validatePublicHttpUrl(source.sourceUrl)
    } catch (e: unknown) {
      pageDebug.push({
        source_url: source.sourceUrl,
        source_domain: "",
        page_url: source.sourceUrl,
        status: "error",
        skip_reason: null,
        error_reason: String(e instanceof Error ? e.message : e),
        extraction_method_attempted: [],
        http_status: null,
        content_type: null,
        html_length: null,
        truncated_body_length: null,
        discovered_links_count: 0,
        fields_found_count: 0,
        url_validation: "failed",
        domain_policy: "blocked",
        robots_allowed: null,
        robots_reason: null,
        structured_data_detected_static: null,
        structured_data_detected_rendered: null,
        rendered_fallback_decision: "not_requested",
        rendered_fallback_result: "not_attempted",
        final_stop_reason: "invalid_source_url",
        search_source: sourceSearchMeta.search_source,
        search_engine: sourceSearchMeta.search_engine,
        search_query: sourceSearchMeta.search_query,
        search_rank: sourceSearchMeta.search_rank,
      })
      errors.push({
        source_url: source.sourceUrl,
        code: "invalid_source_url",
        message: String(e instanceof Error ? e.message : e),
      })
      continue
    }

    const sourceDomain = normalizedSource.hostname.toLowerCase()
    const domainPolicy = evaluateDomainPolicy(sourceDomain)
    if (!domainPolicy.allowed) {
      pageDebug.push({
        source_url: source.sourceUrl,
        source_domain: sourceDomain,
        page_url: normalizedSource.toString(),
        status: "skipped",
        skip_reason: domainPolicy.reason || "domain_not_allowed",
        error_reason: null,
        extraction_method_attempted: [],
        http_status: null,
        content_type: null,
        html_length: null,
        truncated_body_length: null,
        discovered_links_count: 0,
        fields_found_count: 0,
        url_validation: "passed",
        domain_policy: "blocked",
        robots_allowed: null,
        robots_reason: null,
        structured_data_detected_static: null,
        structured_data_detected_rendered: null,
        rendered_fallback_decision: useRenderedFallback ? "not_triggered" : "not_requested",
        rendered_fallback_result: "not_attempted",
        final_stop_reason: domainPolicy.reason || "domain_not_allowed",
        search_source: sourceSearchMeta.search_source,
        search_engine: sourceSearchMeta.search_engine,
        search_query: sourceSearchMeta.search_query,
        search_rank: sourceSearchMeta.search_rank,
      })
      skipped.push({
        source_url: source.sourceUrl,
        reason: domainPolicy.reason || "domain_not_allowed",
      })
      continue
    }

    const queue: Array<{ url: URL; depth: number }> = [{ url: normalizedSource, depth: 0 }]
    const perSourceCap = Math.max(1, Math.floor(source.crawlLimitPerSource || maxTotalPages))
    let processedForSource = 0
    let internalExpandedForSource = 0
    const queuedContactPaths = new Set<string>()

    while (queue.length > 0) {
      if (shouldStop()) break
      if (processedForSource >= perSourceCap) break

      const nextItem = queue.shift()
      if (!nextItem) break
      const next = nextItem.url
      const nextDepth = nextItem.depth

      const canonical = canonicalizeUrl(next)
      if (visited.has(canonical)) continue
      visited.add(canonical)

      const debugEntry: PageDebugInfo = {
        source_url: source.sourceUrl,
        source_domain: sourceDomain,
        page_url: canonical,
        status: "error",
        skip_reason: null,
        error_reason: null,
        extraction_method_attempted: ["static_html"],
        http_status: null,
        content_type: null,
        html_length: null,
        truncated_body_length: null,
        discovered_links_count: 0,
        fields_found_count: 0,
        url_validation: "passed",
        domain_policy: "allowed",
        robots_allowed: null,
        robots_reason: null,
        structured_data_detected_static: null,
        structured_data_detected_rendered: null,
        rendered_fallback_decision: useRenderedFallback ? "not_triggered" : "not_requested",
        rendered_fallback_result: "not_attempted",
        final_stop_reason: "unknown",
        search_source: sourceSearchMeta.search_source,
        search_engine: sourceSearchMeta.search_engine,
        search_query: sourceSearchMeta.search_query,
        search_rank: sourceSearchMeta.search_rank,
      }

      if (isLikelyBinaryPath(next.pathname)) {
        debugEntry.status = "skipped"
        debugEntry.skip_reason = "binary_or_asset_path"
        debugEntry.final_stop_reason = "binary_or_asset_path"
        pageDebug.push(debugEntry)
        skipped.push({
          source_url: source.sourceUrl,
          page_url: canonical,
          reason: "binary_or_asset_path",
        })
        continue
      }

      const robots = await canCrawlUrlByRobots({
        pageUrl: next,
        userAgent: USER_AGENT,
      })
      debugEntry.robots_allowed = robots.allowed
      debugEntry.robots_reason = robots.reason || null
      if (!robots.allowed) {
        debugEntry.status = "skipped"
        debugEntry.skip_reason = robots.reason || "robots_blocked"
        debugEntry.final_stop_reason = robots.reason || "robots_blocked"
        pageDebug.push(debugEntry)
        skipped.push({
          source_url: source.sourceUrl,
          page_url: canonical,
          reason: robots.reason || "robots_blocked",
        })
        continue
      }

      totalPagesAttempted += 1
      processedForSource += 1

      const pageRes = await limit(() =>
        fetchPageWithRetry({
          url: next,
          timeoutMs: 6_000,
          maxBytes: FETCH_MAX_BYTES,
          userAgent: USER_AGENT,
          retryCount: 1,
        })
      )

      if (!pageRes.ok) {
        debugEntry.http_status = pageRes.status
        debugEntry.content_type = pageRes.contentType || null
        if (pageRes.error === "max_bytes_exceeded") {
          debugEntry.truncated_body_length = FETCH_MAX_BYTES
        }
        const isSkipped =
          pageRes.error === "non_html" ||
          pageRes.error === "max_bytes_exceeded" ||
          pageRes.error.startsWith("status_4")
        if (isSkipped) {
          debugEntry.status = "skipped"
          debugEntry.skip_reason = pageRes.error
          debugEntry.final_stop_reason = pageRes.error
          pageDebug.push(debugEntry)
          skipped.push({
            source_url: source.sourceUrl,
            page_url: pageRes.finalUrl,
            reason: pageRes.error,
          })
        } else {
          debugEntry.status = "error"
          debugEntry.error_reason = pageRes.error
          debugEntry.final_stop_reason = pageRes.error
          pageDebug.push(debugEntry)
          errors.push({
            source_url: source.sourceUrl,
            page_url: pageRes.finalUrl,
            code: "fetch_failed",
            message: pageRes.error,
          })
        }
        await sleep(DEFAULT_CRAWL_DELAY_MS)
        continue
      }

      const finalUrl = new URL(pageRes.finalUrl)
      debugEntry.page_url = finalUrl.toString()
      debugEntry.http_status = pageRes.status
      debugEntry.content_type = pageRes.contentType || null
      debugEntry.html_length = pageRes.html.length
      const adapter = getAdapterForHostname(finalUrl.hostname)
      try {
        // In manual mode, allow rendered fallback even if toggle is off.
        // This improves recovery on JS-heavy sites where footer/contact isn't in static HTML.
        const effectiveUseRenderedFallback = Boolean(useRenderedFallback || mode === "manual")
        const extracted = await adapter.extract({
          sourceUrl: source.sourceUrl,
          sourceDomain,
          pageUrl: finalUrl.toString(),
          html: pageRes.html,
          useRenderedFallback: effectiveUseRenderedFallback,
        })

        const debugMap = parseDebugEntries(extracted.debug)
        const methodsFromDebug = String(debugMap.method_attempted || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
        if (methodsFromDebug.length > 0) {
          debugEntry.extraction_method_attempted = Array.from(new Set(methodsFromDebug))
        }
        if (toBool(debugMap.rendered_fallback_attempted)) {
          debugEntry.rendered_fallback_decision = "triggered"
          debugEntry.rendered_fallback_result = "success"
        } else if (debugMap.rendered_fallback_decision === "not_triggered") {
          debugEntry.rendered_fallback_decision = "not_triggered"
        } else if (debugMap.rendered_fallback_decision === "not_requested") {
          debugEntry.rendered_fallback_decision = "not_requested"
        }
        if (toBool(debugMap.rendered_fallback_failed)) {
          debugEntry.rendered_fallback_decision = "triggered"
          debugEntry.rendered_fallback_result = "failed"
        }
        debugEntry.structured_data_detected_static = toBool(debugMap.structured_data_static)
        debugEntry.structured_data_detected_rendered = toBool(debugMap.structured_data_rendered)
        debugEntry.fields_found_count = countFieldsFound(extracted as Record<string, unknown>)

        const extractedContacts = Array.isArray((extracted as Record<string, unknown>).contacts)
          ? ((extracted as Record<string, unknown>).contacts as Array<Record<string, unknown>>)
          : []

        if (extractedContacts.length > 0) {
          for (const contact of extractedContacts.slice(0, 40)) {
            const rowFields = createContactRowFields(extracted as Record<string, unknown>, contact as ContactRecord)
            const contactRow = toRow({
              source,
              sourceDomain,
              pageUrl: finalUrl.toString(),
              fields: rowFields,
            })
            const lead = scoreLeadForRow(contactRow, debugEntry)
            contactRow.lead_score = lead.lead_score
            contactRow.lead_grade = lead.lead_grade
            contactRow.lead_signals = lead.lead_signals
            contactRow.lead_summary = lead.lead_summary
            rows.push(contactRow)
          }
          debugEntry.status = "success"
          debugEntry.final_stop_reason = "multi_rows_extracted"
        } else {
          // If no direct contact was extracted from HTML/render, try same-domain JS bundles.
          if (!String((extracted as Record<string, unknown>).phone || "").trim() && !String((extracted as Record<string, unknown>).mobile || "").trim()) {
            const scriptPhones = await extractPhonesFromSameDomainScripts({
              html: pageRes.html,
              baseUrl: finalUrl,
              userAgent: USER_AGENT,
            })
            if (scriptPhones.length > 0) {
              ;(extracted as Record<string, unknown>).phone = applyCountryPrefixForUrl(scriptPhones[0], finalUrl)
              const currentNotes = String((extracted as Record<string, unknown>).notes || "")
              ;(extracted as Record<string, unknown>).notes = [currentNotes, "found:script_src_phone"].filter(Boolean).join("; ")
            }
          }

          const row = toRow({
            source,
            sourceDomain,
            pageUrl: finalUrl.toString(),
            fields: extracted as Record<string, unknown>,
          })

          const lead = scoreLeadForRow(row, debugEntry)
          row.lead_score = lead.lead_score
          row.lead_grade = lead.lead_grade
          row.lead_signals = lead.lead_signals
          row.lead_summary = lead.lead_summary
          debugEntry.lead_score = lead.lead_score
          debugEntry.lead_grade = lead.lead_grade
          debugEntry.lead_signals = lead.lead_signals
          debugEntry.lead_summary = lead.lead_summary
          debugEntry.status = row.status === "failed" ? "failed" : "success"
          debugEntry.final_stop_reason = row.status === "failed" ? "insufficient_extracted_fields" : "row_extracted"
          rows.push(row)
        }

        if (nextDepth === 0 && isWeakExtraction(extracted as Record<string, unknown>)) {
          queueContactPathFallbacks({
            base: finalUrl,
            queue,
            seenPathSet: queuedContactPaths,
            maxAdds: 4,
          })
        }
      } catch (e: unknown) {
        const errorMessage = String(e instanceof Error ? e.message : e)
        if (errorMessage.startsWith("rendered_fallback_failed:")) {
          debugEntry.rendered_fallback_decision = "triggered"
          debugEntry.rendered_fallback_result = "failed"
        }
        debugEntry.status = "error"
        debugEntry.error_reason = errorMessage
        debugEntry.final_stop_reason = "extract_failed"
        errors.push({
          source_url: source.sourceUrl,
          page_url: finalUrl.toString(),
          code: "extract_failed",
          message: errorMessage,
        })
      }

      if (followInternal) {
        const discovered = discoverInternalLinks(pageRes.html, finalUrl, sourceDomain)
        const prioritized = selectHighValueInternalLinks(discovered, Math.min(30, maxTotalPages))
        if (mode === "google_search") {
          if (enableInternalExpansion && nextDepth < internalLinkMaxDepth && internalExpandedForSource < internalLinkMaxPagesPerDomain) {
            const selected = prioritized.slice(0, internalLinkMaxPagesPerDomain - internalExpandedForSource)
            debugEntry.discovered_links_count = selected.length
            for (const href of selected) {
              if (visited.has(href)) continue
              if (queue.length >= maxTotalPages) break
              queue.push({ url: new URL(href), depth: nextDepth + 1 })
              internalExpandedForSource += 1
              if (internalExpandedForSource >= internalLinkMaxPagesPerDomain) break
            }
          } else {
            debugEntry.discovered_links_count = discovered.length
          }
        } else {
          debugEntry.discovered_links_count = prioritized.length
          for (const href of prioritized) {
            if (visited.has(href)) continue
            if (queue.length >= maxTotalPages) break
            queue.push({ url: new URL(href), depth: nextDepth + 1 })
          }
        }
      }

      pageDebug.push(debugEntry)

      await sleep(DEFAULT_CRAWL_DELAY_MS)
    }
  }

  const dedupedRows = dedupeRows(rows)

  return {
    rows: dedupedRows,
    errors,
    skipped,
    page_debug: pageDebug,
    summary: {
      total_sources: sources.length,
      total_pages_attempted: totalPagesAttempted,
      total_rows: dedupedRows.length,
      total_skipped: skipped.length,
      total_errors: errors.length,
      stopped_reason: stoppedReason,
    },
  }
}
