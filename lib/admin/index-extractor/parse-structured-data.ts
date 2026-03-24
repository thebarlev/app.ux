import * as cheerio from "cheerio"
import type { FieldExtraction } from "./types"

type Candidate = FieldExtraction & {
  _source: "jsonld" | "hydration" | "og"
  _schemaType: string
}

const GENERIC_BUSINESS_NAMES = new Set(["home", "homepage", "welcome", "index", "website", "site", "contact", "about"])

function normalize(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const v of values) {
    const s = normalize(v)
    if (s) return s
  }
  return ""
}

function safeJsonParse<T = unknown>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toSchemaType(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").toLowerCase()
  return String(value || "").toLowerCase()
}

function pickByKeys(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = normalize(obj[key])
    if (direct) return direct
  }
  return ""
}

function pickFromUnknown(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return ""
  return pickByKeys(value as Record<string, unknown>, keys)
}

function firstContactPoint(rec: Record<string, unknown>): Record<string, unknown> | null {
  const raw = rec.contactPoint
  if (!raw) return null
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") return item as Record<string, unknown>
    }
    return null
  }
  if (typeof raw === "object") return raw as Record<string, unknown>
  return null
}

function buildAddress(addressObj: unknown): { address: string; city: string } {
  if (!addressObj) return { address: "", city: "" }
  if (typeof addressObj === "string") return { address: normalize(addressObj), city: "" }
  if (typeof addressObj !== "object") return { address: "", city: "" }
  const addr = addressObj as Record<string, unknown>
  const city = firstNonEmpty(addr.addressLocality, addr.city, addr["עיר"])
  const parts = [
    firstNonEmpty(addr.streetAddress, addr.addressLine, addr["כתובת"], addr["מען"]),
    firstNonEmpty(city),
    firstNonEmpty(addr.addressRegion, addr.region),
    firstNonEmpty(addr.postalCode),
    firstNonEmpty(addr.addressCountry, addr.country),
  ].filter(Boolean)
  return {
    address: parts.join(", "),
    city,
  }
}

function cleanBusinessName(value: string): string {
  const raw = normalize(value)
  if (!raw) return ""
  if (raw.length > 90) return ""
  if (GENERIC_BUSINESS_NAMES.has(raw.toLowerCase())) return ""
  return raw
}

function pickFromObject(obj: unknown, source: Candidate["_source"]): Candidate | null {
  if (!obj || typeof obj !== "object") return null
  const rec = obj as Record<string, unknown>
  const schemaType = toSchemaType(rec["@type"])
  const addressInfo = buildAddress(rec.address)
  const organizationObj = typeof rec.organization === "object" && rec.organization ? (rec.organization as Record<string, unknown>) : null
  const contactPointObj = firstContactPoint(rec)
  const sameAs = Array.isArray(rec.sameAs) ? rec.sameAs.map((v) => normalize(v)).filter(Boolean) : []

  const fullName = firstNonEmpty(
    pickByKeys(rec, ["fullName", "name", "contactName", "contact_name", "שם מלא", "שם"]),
    contactPointObj?.name
  )
  const businessName = cleanBusinessName(
    firstNonEmpty(
      pickByKeys(rec, ["legalName", "organizationName", "businessName", "company", "companyName", "name", "עסק", "חברה", "ארגון"]),
      organizationObj?.name
    )
  )
  const phone = firstNonEmpty(
    pickByKeys(rec, ["telephone", "phone", "טלפון", "נייד", "פלאפון"]),
    contactPointObj?.telephone
  )
  const email = firstNonEmpty(pickByKeys(rec, ["email", "mail", "דואל", "דוא\"ל", "אימייל"]), contactPointObj?.email)
  const category = firstNonEmpty(pickByKeys(rec, ["category", "jobTitle", "type", "תחום"]), schemaType)
  const city = firstNonEmpty(addressInfo.city, pickByKeys(rec, ["city", "עיר"]))
  const address = firstNonEmpty(addressInfo.address, pickByKeys(rec, ["address", "כתובת"]))
  const website = firstNonEmpty(
    pickByKeys(rec, ["url", "website"]),
    pickFromUnknown(rec.mainEntity, ["url"]),
    organizationObj?.url
  )

  const candidate: Candidate = {
    business_name: schemaType.includes("person") ? "" : businessName,
    full_name: schemaType.includes("person") ? fullName : firstNonEmpty(fullName, contactPointObj?.name),
    phone,
    email,
    website,
    address,
    city,
    category,
    notes: sameAs.length > 0 ? `structured_sameAs:${sameAs.slice(0, 3).join("|")}` : "",
    extraction_method: "json_api",
    _source: source,
    _schemaType: schemaType,
  }
  const hasSignal = Boolean(
    candidate.business_name || candidate.full_name || candidate.phone || candidate.email || candidate.address || candidate.city
  )
  if (!hasSignal) return null
  return candidate
}

function walk(node: unknown, source: Candidate["_source"], acc: Candidate[], depth = 0): void {
  if (!node || depth > 8) return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, source, acc, depth + 1)
    return
  }
  if (typeof node !== "object") return

  const picked = pickFromObject(node, source)
  if (picked) acc.push(picked)
  for (const value of Object.values(node as Record<string, unknown>)) {
    walk(value, source, acc, depth + 1)
  }
}

function parseHydrationJsonCandidates(html: string): Candidate[] {
  const out: Candidate[] = []
  const patterns = [
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?/gi,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?/gi,
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?/gi,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?/gi,
  ]

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern)
    for (const match of matches) {
      const parsed = safeJsonParse(match[1] || "")
      if (!parsed) continue
      walk(parsed, "hydration", out)
    }
  }
  return out
}

function scoreCandidate(candidate: Candidate): number {
  let score = 0
  if (candidate.business_name) score += 2.5
  if (candidate.full_name) score += 2
  if (candidate.email) score += 2.5
  if (candidate.phone) score += 2
  if (candidate.address) score += 1.5
  if (candidate.city) score += 1
  if (candidate.website) score += 1

  const schemaType = candidate._schemaType
  if (schemaType.includes("organization") || schemaType.includes("localbusiness")) score += 2
  if (schemaType.includes("person")) score += 1.5
  if (candidate._source === "jsonld") score += 1.2
  if (candidate._source === "og") score += 0.6

  return score
}

function toFieldExtraction(candidate: Candidate | null): FieldExtraction {
  if (!candidate) return {}
  return {
    page_title: "",
    full_name: candidate.full_name || "",
    business_name: candidate.business_name || "",
    phone: candidate.phone || "",
    email: candidate.email || "",
    website: candidate.website || "",
    address: candidate.address || "",
    city: candidate.city || "",
    category: candidate.category || "",
    notes: candidate.notes || "",
    extraction_method: "json_api",
    confidence_score: Math.min(0.95, Math.max(0.35, scoreCandidate(candidate) / 10)),
    debug: [
      `structured_source=${candidate._source}`,
      `structured_schema=${candidate._schemaType || "unknown"}`,
      `structured_score=${scoreCandidate(candidate).toFixed(2)}`,
    ],
  }
}

function buildStructuredContacts(candidates: Candidate[]): NonNullable<FieldExtraction["contacts"]> {
  const out: NonNullable<FieldExtraction["contacts"]> = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const full_name = candidate.full_name || ""
    const business_name = candidate.business_name || ""
    const email = candidate.email || ""
    const phone = candidate.phone || ""
    const key = `${email.toLowerCase()}|${phone}|${full_name.toLowerCase()}|${business_name.toLowerCase()}`
    if (!email && !phone && !full_name) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      full_name,
      business_name,
      email,
      phone,
      address: candidate.address || "",
      city: candidate.city || "",
      category: candidate.category || "",
      notes: candidate.notes || "",
      extraction_method: "ld+json",
      confidence_score: Math.min(0.95, Math.max(0.35, scoreCandidate(candidate) / 10)),
    })
    if (out.length >= 25) break
  }

  return out
}

export function parseStructuredDataFromHtml(html: string): FieldExtraction {
  const $ = cheerio.load(html || "")
  const candidates: Candidate[] = []

  $("script[type='application/ld+json']").each((_, el) => {
    const parsed = safeJsonParse($(el).text())
    walk(parsed, "jsonld", candidates)
  })

  parseHydrationJsonCandidates(html).forEach((candidate) => candidates.push(candidate))

  const ogSiteName = cleanBusinessName(firstNonEmpty($("meta[property='og:site_name']").attr("content")))
  if (ogSiteName) {
    candidates.push({
      business_name: ogSiteName,
      extraction_method: "json_api",
      _source: "og",
      _schemaType: "og",
    })
  }

  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
  const top = toFieldExtraction(candidates[0] || null)
  const contacts = buildStructuredContacts(candidates)
  if (contacts.length > 0) top.contacts = contacts
  return top
}
