import { parseContactFieldsFromHtml } from "@/lib/admin/index-extractor/parse-contact-fields"
import { parseNameConservatively } from "@/lib/admin/index-extractor/parse-name"
import { parseStructuredDataFromHtml } from "@/lib/admin/index-extractor/parse-structured-data"
import { normalizeAndClassifyPhone } from "@/lib/admin/index-extractor/normalize-phone"
import { getRenderedHtml } from "@/lib/admin/index-extractor/rendered-fallback"
import type { FieldExtraction, IndexExtractorAdapter } from "@/lib/admin/index-extractor/types"

function mergeContacts(...groups: Array<FieldExtraction["contacts"] | undefined>): FieldExtraction["contacts"] {
  const out: NonNullable<FieldExtraction["contacts"]> = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const contact of group || []) {
      const key = `${String(contact.email || "").toLowerCase()}|${String(contact.phone || "")}|${String(contact.full_name || "").toLowerCase()}`
      if (!contact.email && !contact.phone && !contact.full_name) continue
      if (seen.has(key)) continue
      seen.add(key)
      out.push(contact)
    }
  }
  return out
}

function mergePreferred(primary: FieldExtraction, secondary: FieldExtraction): FieldExtraction {
  const out: FieldExtraction = { ...secondary, ...primary }
  const keys: Array<keyof FieldExtraction> = [
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
    "notes",
    "extraction_method",
    "confidence_score",
    "debug",
  ]
  for (const key of keys) {
    const current = out[key]
    const fallback = secondary[key]
    if (!current && fallback !== undefined) {
      ;(out as Record<string, unknown>)[key] = fallback
    }
  }
  out.contacts = mergeContacts(secondary.contacts, primary.contacts)
  return out
}

function enrichNameAndPhone(base: FieldExtraction): FieldExtraction {
  const out: FieldExtraction = { ...base }

  if (out.full_name && (!out.first_name || !out.last_name)) {
    const parsed = parseNameConservatively(out.full_name)
    if (parsed.confidence >= 0.65) {
      out.first_name = parsed.first_name
      out.last_name = parsed.last_name
    }
  }

  if (out.phone) {
    const normalized = normalizeAndClassifyPhone(out.phone)
    out.phone = normalized.phone || out.phone
    if (!out.mobile && normalized.mobile) out.mobile = normalized.mobile
    if (normalized.raw && normalized.raw !== normalized.normalized) {
      const note = `raw_phone:${normalized.raw}`
      out.notes = out.notes ? `${out.notes}; ${note}` : note
    }
  }

  if (out.mobile) {
    const normalizedMobile = normalizeAndClassifyPhone(out.mobile)
    out.mobile = normalizedMobile.mobile || out.mobile
    if (!out.phone && normalizedMobile.phone) out.phone = normalizedMobile.phone
  }

  return out
}

function hasAnySignals(value: FieldExtraction): boolean {
  return Boolean(value.email || value.phone || value.mobile || value.business_name || value.full_name || value.address || value.city)
}

function hasSiteProfileSignals(value: FieldExtraction): boolean {
  return Boolean(value.page_title && value.business_name && value.website)
}

function parseDebugMap(debug?: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of debug || []) {
    const value = String(item || "")
    const idx = value.indexOf("=")
    if (idx <= 0) continue
    out[value.slice(0, idx).trim()] = value.slice(idx + 1).trim()
  }
  return out
}

function isValidEmail(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(value || "").trim())
}

function cleanCity(value: string): string {
  const city = String(value || "").replace(/\s+/g, " ").trim()
  if (!city) return ""
  const words = city.split(" ").filter(Boolean)
  if (words.length < 1 || words.length > 3) return ""
  if (city.length > 40) return ""
  if (/\d/.test(city)) return ""
  return city
}

function cleanAddress(value: string): string {
  const address = String(value || "").replace(/\s+/g, " ").trim()
  if (!address) return ""
  if (address.length > 160) return ""
  return address
}

function cleanBusinessName(value: string): string {
  const name = String(value || "").replace(/\s+/g, " ").trim()
  if (!name) return ""
  if (name.length > 90) return ""
  return name
}

function addFieldEvidence(debug: string[], field: string, source: string, snippet: string): void {
  const cleanSnippet = String(snippet || "").replace(/\s+/g, " ").trim().slice(0, 80)
  if (!cleanSnippet) return
  debug.push(`field_source_${field}=${source}`)
  debug.push(`field_snippet_${field}=${cleanSnippet}`)
}

function mergeDebugSignals(...values: Array<string[] | undefined>): string[] {
  const out: string[] = []
  for (const list of values) {
    for (const item of list || []) {
      if (!item) continue
      out.push(item)
    }
  }
  return out
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

function ensureCountryPrefix(value: string, pageUrl: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.startsWith("+")) return raw

  const digits = raw.replace(/[^\d]/g, "")
  if (!digits) return ""
  if (digits.startsWith("00")) return `+${digits.slice(2)}`

  let host = ""
  try {
    host = new URL(pageUrl).hostname.toLowerCase()
  } catch {
    host = ""
  }
  const tldPrefix = inferDialPrefixFromHostname(host)

  if (tldPrefix === "+972") {
    if (digits.startsWith("972")) return `+${digits}`
    if (digits.startsWith("0")) return `+972${digits.slice(1)}`
    return `+972${digits}`
  }
  if (tldPrefix === "+1") {
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
    return `+1${digits.replace(/^0+/, "")}`
  }
  if (tldPrefix === "+61") {
    if (digits.startsWith("61")) return `+${digits}`
    return `+61${digits.replace(/^0+/, "")}`
  }
  if (tldPrefix === "+64") {
    if (digits.startsWith("64")) return `+${digits}`
    return `+64${digits.replace(/^0+/, "")}`
  }
  if (tldPrefix === "+44") {
    if (digits.startsWith("44")) return `+${digits}`
    return `+44${digits.replace(/^0+/, "")}`
  }

  // No TLD signal: best-effort heuristic.
  if (digits.length === 10 && !digits.startsWith("0")) return `+1${digits}`
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `+972${digits.slice(1)}`
  return `+${digits}`
}

function computeConfidence(fields: FieldExtraction, debugMap: Record<string, string>): number {
  let score = 0.15

  if (fields.email) score += 0.2
  if (fields.phone || fields.mobile) score += 0.2
  if (fields.business_name || fields.full_name) score += 0.2
  if (fields.address) score += 0.12
  if (fields.city) score += 0.08

  const structuredSource = debugMap.structured_source || ""
  if (structuredSource && structuredSource !== "unknown") score += 0.14

  const labelEvidence = Object.keys(debugMap).some((key) => key.startsWith("evidence_") && debugMap[key].startsWith("label:"))
  const linkEvidence = Object.keys(debugMap).some((key) => key.startsWith("evidence_") && debugMap[key].startsWith("link:"))
  const weakHtmlEvidence = Object.keys(debugMap).some((key) => key.startsWith("evidence_") && debugMap[key].startsWith("html:"))

  if (labelEvidence) score += 0.1
  if (linkEvidence) score += 0.06
  if (weakHtmlEvidence) score -= 0.04

  if (!fields.email && !fields.phone && !fields.mobile && !fields.full_name && !fields.business_name) score -= 0.12

  return Math.max(0, Math.min(1, score))
}

function validateAndFinalize(
  base: FieldExtraction,
  debugItems: string[],
  sourceHints: { structuredSource: string; rendered: boolean; pageUrl: string }
): FieldExtraction {
  const out: FieldExtraction = { ...base }

  out.business_name = cleanBusinessName(out.business_name || "")
  out.address = cleanAddress(out.address || "")
  out.city = cleanCity(out.city || "")

  const rawEmail = String(out.email || "").toLowerCase().trim()
  out.email = isValidEmail(rawEmail) ? rawEmail : ""

  const normalizedPhone = normalizeAndClassifyPhone(String(out.phone || ""))
  const normalizedMobile = normalizeAndClassifyPhone(String(out.mobile || ""))
  out.phone = normalizedPhone.phone || (normalizedPhone.mobile ? "" : out.phone || "")
  out.mobile = normalizedMobile.mobile || normalizedPhone.mobile || ""
  if (!out.phone && normalizedMobile.phone) out.phone = normalizedMobile.phone
  out.phone = ensureCountryPrefix(String(out.phone || ""), sourceHints.pageUrl)
  out.mobile = ensureCountryPrefix(String(out.mobile || ""), sourceHints.pageUrl)

  const parsedName = parseNameConservatively(String(out.full_name || ""))
  if (parsedName.confidence >= 0.75) {
    out.full_name = parsedName.full_name
    out.first_name = parsedName.first_name
    out.last_name = parsedName.last_name
  } else {
    out.first_name = ""
    out.last_name = ""
  }

  if (out.business_name && out.full_name && out.business_name.toLowerCase() === out.full_name.toLowerCase()) {
    out.full_name = ""
    out.first_name = ""
    out.last_name = ""
  }

  const debugMap = parseDebugMap(debugItems)
  if (sourceHints.structuredSource) {
    addFieldEvidence(debugItems, "structured", sourceHints.structuredSource, sourceHints.structuredSource)
  }
  if (sourceHints.rendered) {
    debugItems.push("field_source_rendered=rendered")
  }

  if (!out.email && !out.phone && !out.mobile && hasSiteProfileSignals(out)) {
    out.notes = out.notes ? `${out.notes}; site_profile_row=1` : "site_profile_row=1"
    debugItems.push("site_profile_row=1")
  }

  if (Array.isArray(out.contacts) && out.contacts.length > 0) {
    out.contacts = out.contacts
      .map((contact) => {
        const phoneN = normalizeAndClassifyPhone(String(contact.phone || ""))
        const mobileN = normalizeAndClassifyPhone(String(contact.mobile || ""))
        const rawEmail = String(contact.email || "").toLowerCase().trim()
        return {
          ...contact,
          email: isValidEmail(rawEmail) ? rawEmail : "",
          phone: ensureCountryPrefix(phoneN.phone || (phoneN.mobile ? "" : String(contact.phone || "")), sourceHints.pageUrl),
          mobile: ensureCountryPrefix(mobileN.mobile || phoneN.mobile || "", sourceHints.pageUrl),
          confidence_score: typeof contact.confidence_score === "number" ? Math.max(0, Math.min(1, contact.confidence_score)) : 0.6,
        }
      })
      .filter((contact) => Boolean(contact.email || contact.phone || contact.mobile || contact.full_name))
      .slice(0, 40)
  }

  out.confidence_score = computeConfidence(out, debugMap)
  out.debug = mergeDebugSignals(debugItems, out.debug)
  return out
}

export const genericAdapter: IndexExtractorAdapter = {
  id: "generic",
  match: () => true,
  async extract(ctx) {
    const debug: string[] = ["method_attempted=static_html"]
    const structured = parseStructuredDataFromHtml(ctx.html)
    const structuredDebug = parseDebugMap(structured.debug)
    const hasStaticStructured = hasAnySignals(structured)
    debug.push(`structured_data_static=${hasStaticStructured ? "1" : "0"}`)
    const staticParsed = parseContactFieldsFromHtml(ctx.html, ctx.pageUrl)
    let merged = enrichNameAndPhone(mergePreferred(structured, staticParsed))
    let mergedDebug = mergeDebugSignals(structured.debug, staticParsed.debug)

    const hasCoreSignals = Boolean(merged.email || merged.phone || merged.mobile || merged.business_name || merged.full_name || merged.address)
    const hasDirectContactSignals = Boolean(merged.email || merged.phone || merged.mobile)
    const hasSiteSignals = hasSiteProfileSignals(merged)
    const isLikelyJsHeavy = ctx.html.length < 6000 || (!ctx.html.includes("mailto:") && !ctx.html.includes("tel:") && !hasCoreSignals)
    // Trigger rendered fallback whenever explicit contact methods are missing,
    // even if site-profile/business signals exist from static HTML.
    const shouldForceRendered = Boolean(ctx.useRenderedFallback && (isLikelyJsHeavy || !hasDirectContactSignals))
    if (ctx.useRenderedFallback) {
      debug.push(`rendered_fallback_decision=${shouldForceRendered ? "triggered" : "not_triggered"}`)
      if (isLikelyJsHeavy) debug.push("rendered_fallback_reason=js_heavy_or_no_contact_signals")
      if (!hasCoreSignals) debug.push("rendered_fallback_reason=no_core_fields_after_static")
    } else {
      debug.push("rendered_fallback_decision=not_requested")
    }

    if (shouldForceRendered) {
      try {
        const rendered = await getRenderedHtml({ url: ctx.pageUrl })
        debug.push("method_attempted=rendered_html")
        debug.push("rendered_fallback_attempted=1")
        const renderedStructured = parseStructuredDataFromHtml(rendered)
        debug.push(`structured_data_rendered=${hasAnySignals(renderedStructured) ? "1" : "0"}`)
        const renderedStatic = parseContactFieldsFromHtml(rendered, ctx.pageUrl)
        merged = enrichNameAndPhone(mergePreferred(renderedStructured, renderedStatic))
        mergedDebug = mergeDebugSignals(mergedDebug, renderedStructured.debug, renderedStatic.debug)
        merged.extraction_method = merged.extraction_method === "json_api" ? "json_api" : "rendered_html"
        merged.notes = merged.notes ? `${merged.notes}; used_render_fallback` : "used_render_fallback"
      } catch (e: unknown) {
        debug.push("rendered_fallback_failed=1")
        throw new Error(`rendered_fallback_failed:${String(e instanceof Error ? e.message : e)}`)
      }
    }

    if (!merged.extraction_method) merged.extraction_method = "static_html"
    const methods = Array.from(new Set(debug.filter((entry) => entry.startsWith("method_attempted=")).map((entry) => entry.split("=")[1])))
    const combinedDebug = [...debug.filter((entry) => !entry.startsWith("method_attempted=")), ...mergedDebug, `method_attempted=${methods.join(",")}`]
    return validateAndFinalize(merged, combinedDebug, {
      structuredSource: structuredDebug.structured_source || "",
      rendered: methods.includes("rendered_html"),
      pageUrl: ctx.pageUrl,
    })
  },
}
