import * as cheerio from "cheerio"
import { discoverSourcesFromGoogleQuery } from "@/lib/admin/index-extractor/google-search"
import { fetchPageWithRetry } from "@/lib/admin/index-extractor/fetch-page"
import { parseContactFieldsFromHtml } from "@/lib/admin/index-extractor/parse-contact-fields"
import { parseStructuredDataFromHtml } from "@/lib/admin/index-extractor/parse-structured-data"
import { normalizeAndClassifyPhone } from "@/lib/admin/index-extractor/normalize-phone"
import { canCrawlUrlByRobots } from "@/lib/admin/index-extractor/robots"
import { validatePublicHttpUrl } from "@/lib/admin/index-extractor/url-safety"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { ArchitectureCrawlerInput, ArchitectureCrawlerResult, ArchitectureLead } from "@/lib/admin/architecture-crawler/types"

const TARGET_COUNTRIES = ["usa", "canada", "australia", "new zealand"] as const
const MAX_CANDIDATE_DOMAINS = 600
const MAX_CRAWL_DOMAINS = 450
const MAX_PAGES_PER_DOMAIN = 3
const MAX_DOMAIN_RUNTIME_MS = 10_000
const USER_AGENT = "VOW-Architecture-Crawler/1.0 (+https://app.uxellent.com)"
const FETCH_TIMEOUT_MS = 3_500

const COUNTRY_BY_GL = {
  us: "usa",
  ca: "canada",
  au: "australia",
  nz: "new zealand",
} as const

type CountryGl = keyof typeof COUNTRY_BY_GL

const COUNTRY_HINTS: Array<{ country: string; hints: string[] }> = [
  { country: "usa", hints: [" united states ", " usa ", " u.s.a ", " us ", " ny ", " california "] },
  { country: "canada", hints: [" canada ", " toronto ", " vancouver ", " montreal "] },
  { country: "australia", hints: [" australia ", " sydney ", " melbourne ", " brisbane "] },
  { country: "new zealand", hints: [" new zealand ", " auckland ", " wellington ", " christchurch "] },
]

const BLOCKED_HOST_HINTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "pinterest.",
  "wikipedia.org",
  "archdaily.com",
  "architizer.com",
]

const LOW_VALUE_PATH_HINTS = ["/blog", "/news", "/top-", "/list", "/category", "/tag", "/search", "/results"]
const CONTACT_PATHS = ["/", "/contact", "/contact-us"]

function normalizeDomain(hostname: string): string {
  return String(hostname || "").toLowerCase().replace(/^www\./, "")
}

function normalizeUrl(raw: string): URL | null {
  try {
    const parsed = new URL(String(raw || "").trim())
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    parsed.hash = ""
    return parsed
  } catch {
    return null
  }
}

function looksBlockedHost(host: string): boolean {
  const lower = normalizeDomain(host)
  return BLOCKED_HOST_HINTS.some((hint) => lower.includes(hint))
}

function looksLowValuePath(pathname: string): boolean {
  const lower = String(pathname || "").toLowerCase()
  return LOW_VALUE_PATH_HINTS.some((hint) => lower.includes(hint))
}

function isValidLeadEmail(value: string): boolean {
  const email = String(value || "").trim().toLowerCase()
  if (!email) return false
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) return false
  if (["example.com", "test.com", "email.com"].some((blocked) => email.endsWith(`@${blocked}`))) return false
  return true
}

function normalizeLeadPhone(value: string): string {
  const out = normalizeAndClassifyPhone(String(value || ""))
  return out.mobile || out.phone || out.normalized || ""
}

function detectCountryFromHost(hostname: string): string {
  const lower = normalizeDomain(hostname)
  if (lower.endsWith(".us")) return "usa"
  if (lower.endsWith(".ca")) return "canada"
  if (lower.endsWith(".au")) return "australia"
  if (lower.endsWith(".nz")) return "new zealand"
  return ""
}

function detectCountryFromText(content: string): string {
  const normalized = ` ${String(content || "").toLowerCase().replace(/\s+/g, " ")} `
  for (const entry of COUNTRY_HINTS) {
    if (entry.hints.some((hint) => normalized.includes(hint))) return entry.country
  }
  return ""
}

function scorePagePath(pathname: string): number {
  const lower = String(pathname || "").toLowerCase()
  if (lower === "/" || lower === "") return 2
  if (lower.includes("contact")) return 5
  if (lower.includes("about")) return 3
  return 1
}

function extractCompanyName(html: string, fallbackWebsite: string): string {
  const structured = parseStructuredDataFromHtml(html)
  const staticParsed = parseContactFieldsFromHtml(html, fallbackWebsite)
  const structuredName = String(structured.business_name || structured.full_name || "").trim()
  if (structuredName) return structuredName
  const staticName = String(staticParsed.business_name || "").trim()
  if (staticName) return staticName

  const $ = cheerio.load(html || "")
  const ogName = String($("meta[property='og:site_name']").attr("content") || "").trim()
  if (ogName) return ogName
  const title = String($("title").first().text() || "").replace(/\s+/g, " ").trim()
  return title.replace(/\s*[|•-]\s*.*/, "").slice(0, 120)
}

function extractPageSignals(html: string, pageUrl: string): {
  company_name: string
  email: string
  phone: string
  location: string
  enterprise: boolean
} {
  const structured = parseStructuredDataFromHtml(html)
  const staticParsed = parseContactFieldsFromHtml(html, pageUrl)
  const textBlob = `${html} ${structured.notes || ""} ${staticParsed.notes || ""}`.replace(/\s+/g, " ").toLowerCase()

  const company_name = extractCompanyName(html, pageUrl)
  const emailCandidate = String(structured.email || staticParsed.email || "").trim().toLowerCase()
  const phoneCandidate = String(structured.mobile || structured.phone || staticParsed.mobile || staticParsed.phone || "").trim()
  const locationCandidate = String(structured.city || structured.address || staticParsed.city || staticParsed.address || "").trim()

  const employeeMatch = textBlob.match(/\b([2-9]\d{2,}|\d{4,})\s+(employees|team members|staff)\b/i)
  const enterprise = Boolean(employeeMatch)

  return {
    company_name,
    email: isValidLeadEmail(emailCandidate) ? emailCandidate : "",
    phone: normalizeLeadPhone(phoneCandidate),
    location: locationCandidate,
    enterprise,
  }
}

function mergeLead(base: ArchitectureLead | null, incoming: ArchitectureLead, pagePath: string): ArchitectureLead {
  if (!base) return incoming
  const incomingScore = scorePagePath(pagePath)
  const baseScore = 2
  return {
    domain: base.domain,
    website: base.website || incoming.website,
    company_name: incomingScore >= baseScore ? incoming.company_name || base.company_name : base.company_name || incoming.company_name,
    email: incomingScore >= baseScore ? incoming.email || base.email : base.email || incoming.email,
    phone: incomingScore >= baseScore ? incoming.phone || base.phone : base.phone || incoming.phone,
    location: base.location || incoming.location,
  }
}

async function discoverFromDirectories(): Promise<string[]> {
  const seedPages = [
    "https://architizer.com/firms/",
    "https://www.archdaily.com/search/projects/categories/offices",
  ]
  const urls: string[] = []
  for (const seed of seedPages) {
    const normalized = normalizeUrl(seed)
    if (!normalized) continue
    const page = await fetchPageWithRetry({
      url: normalized,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: 900_000,
      userAgent: USER_AGENT,
      retryCount: 0,
    })
    if (!page.ok) continue
    const $ = cheerio.load(page.html || "")
    $("a[href]").each((_, el) => {
      const href = String($(el).attr("href") || "").trim()
      if (!href) return
      const parsed = normalizeUrl(href.startsWith("http") ? href : new URL(href, normalized).toString())
      if (!parsed) return
      if (looksBlockedHost(parsed.hostname)) return
      if (looksLowValuePath(parsed.pathname)) return
      urls.push(parsed.toString())
    })
  }
  return urls
}

async function discoverFromGoogle(): Promise<string[]> {
  const queries: Array<{ q: string; gl: CountryGl }> = []
  for (const [gl, country] of Object.entries(COUNTRY_BY_GL) as Array<[CountryGl, string]>) {
    queries.push({ q: `small architecture firms in ${country}`, gl })
    queries.push({ q: `residential architecture studio ${country}`, gl })
    queries.push({ q: `architecture office ${country}`, gl })
  }

  const urls: string[] = []
  for (const query of queries) {
    const discovered = await discoverSourcesFromGoogleQuery({
      query: query.q,
      limit: 20,
      country: query.gl,
      language: "en",
    })
    for (const source of discovered.sources) {
      urls.push(source.sourceUrl)
    }
  }
  return urls
}

function dedupeCandidateDomains(urls: string[]): string[] {
  const byDomain = new Map<string, string>()
  for (const rawUrl of urls) {
    const parsed = normalizeUrl(rawUrl)
    if (!parsed) continue
    const domain = normalizeDomain(parsed.hostname)
    if (!domain || looksBlockedHost(domain)) continue
    if (looksLowValuePath(parsed.pathname)) continue
    if (!byDomain.has(domain)) {
      byDomain.set(domain, `https://${domain}`)
    }
    if (byDomain.size >= MAX_CANDIDATE_DOMAINS) break
  }
  return [...byDomain.values()]
}

async function crawlDomain(startUrl: string): Promise<{ lead: ArchitectureLead | null; enterprise: boolean }> {
  const parsed = normalizeUrl(startUrl)
  if (!parsed) return { lead: null, enterprise: false }

  const safeUrl = await validatePublicHttpUrl(parsed.toString()).catch(() => null)
  if (!safeUrl) return { lead: null, enterprise: false }

  const domain = normalizeDomain(safeUrl.hostname)
  let aggregate: ArchitectureLead | null = null
  let enterprise = false
  const started = Date.now()

  for (const path of CONTACT_PATHS) {
    if (Date.now() - started > MAX_DOMAIN_RUNTIME_MS) break
    const pageUrl = new URL(path, safeUrl.origin)
    const robots = await canCrawlUrlByRobots({ pageUrl, userAgent: USER_AGENT, timeoutMs: 1200 })
    if (!robots.allowed) continue

    const page = await fetchPageWithRetry({
      url: pageUrl,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: 900_000,
      userAgent: USER_AGENT,
      retryCount: 0,
    })
    if (!page.ok) continue

    const signals = extractPageSignals(page.html, pageUrl.toString())
    if (signals.enterprise) enterprise = true

    const detectedCountry = detectCountryFromHost(domain) || detectCountryFromText(`${signals.location} ${page.html}`)
    const incoming: ArchitectureLead = {
      domain,
      company_name: signals.company_name,
      website: safeUrl.origin,
      email: signals.email,
      phone: signals.phone,
      location: detectedCountry || "",
    }
    aggregate = mergeLead(aggregate, incoming, pageUrl.pathname)

    if (aggregate.email && aggregate.phone) break
  }

  if (!aggregate) return { lead: null, enterprise }
  return { lead: aggregate, enterprise }
}

function isCountryAllowed(location: string): boolean {
  const lower = String(location || "").toLowerCase().trim()
  if (!lower) return true
  return TARGET_COUNTRIES.includes(lower as (typeof TARGET_COUNTRIES)[number])
}

function hasContactMethod(lead: ArchitectureLead): boolean {
  return Boolean(String(lead.email || "").trim() || String(lead.phone || "").trim())
}

async function saveLeadsToDb(leads: ArchitectureLead[]): Promise<number> {
  if (leads.length === 0) return 0
  const db = createServiceRoleClient()
  const now = new Date().toISOString()

  const rows = leads.map((lead) => ({
    domain: lead.domain,
    company_name: lead.company_name || null,
    website: lead.website || null,
    email: lead.email || null,
    phone: lead.phone || null,
    location: lead.location || null,
    created_at: now,
    updated_at: now,
  }))

  const upsertRes = await db.from("auditor_leads_architecture").upsert(rows, { onConflict: "domain" })
  if (!upsertRes.error) return leads.length

  const insertRows = leads.map((lead) => ({
    domain: lead.domain,
    company_name: lead.company_name || null,
    website: lead.website || null,
    email: lead.email || null,
    phone: lead.phone || null,
    location: lead.location || null,
  }))
  const insertRes = await db.from("auditor_leads_architecture").insert(insertRows)
  if (insertRes.error) {
    throw new Error(`db_save_failed:${insertRes.error.message}`)
  }
  return leads.length
}

export async function runArchitectureCrawler(input: ArchitectureCrawlerInput): Promise<ArchitectureCrawlerResult> {
  const targetCount = Math.max(1, Math.min(1000, Math.floor(Number(input.targetCount || 1000))))
  const warnings: string[] = []

  const [directoryUrls, googleUrls] = await Promise.all([discoverFromDirectories(), discoverFromGoogle()])
  const candidateUrls = [...directoryUrls, ...googleUrls]
  const candidateDomains = dedupeCandidateDomains(candidateUrls).slice(0, MAX_CRAWL_DOMAINS)

  let stoppedReason: ArchitectureCrawlerResult["summary"]["stopped_reason"]
  let filteredEnterprise = 0
  const leads: ArchitectureLead[] = []
  const started = Date.now()
  const maxRuntimeMs = 3 * 60_000

  for (const domainUrl of candidateDomains) {
    if (leads.length >= targetCount) {
      stoppedReason = "target_reached"
      break
    }
    if (Date.now() - started >= maxRuntimeMs) {
      stoppedReason = "runtime_limit"
      break
    }

    const crawled = await crawlDomain(domainUrl).catch(() => ({ lead: null, enterprise: false }))
    if (crawled.enterprise) {
      filteredEnterprise += 1
      continue
    }
    if (!crawled.lead) continue
    if (!isCountryAllowed(crawled.lead.location)) continue
    if (!hasContactMethod(crawled.lead)) continue
    leads.push(crawled.lead)
  }

  if (!stoppedReason && candidateDomains.length >= MAX_CRAWL_DOMAINS) {
    stoppedReason = "domain_limit"
  }

  const byDomain = new Map<string, ArchitectureLead>()
  for (const lead of leads) {
    if (!byDomain.has(lead.domain)) byDomain.set(lead.domain, lead)
  }
  const deduped = [...byDomain.values()]

  let savedToDb = 0
  try {
    savedToDb = await saveLeadsToDb(deduped)
  } catch (e: unknown) {
    warnings.push(String(e instanceof Error ? e.message : e))
  }

  return {
    leads: deduped,
    summary: {
      target_count: targetCount,
      candidate_urls: candidateUrls.length,
      candidate_domains: candidateDomains.length,
      crawled_domains: Math.min(candidateDomains.length, leads.length + filteredEnterprise),
      leads_found: deduped.length,
      saved_to_db: savedToDb,
      filtered_enterprise: filteredEnterprise,
      stopped_reason: stoppedReason,
    },
    warnings,
  }
}
