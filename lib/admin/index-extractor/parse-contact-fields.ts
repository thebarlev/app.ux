import * as cheerio from "cheerio"
import type { FieldExtraction } from "./types"

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_REGEX = /(?:\+?\d[\d\s()./-]{7,}\d)/g
const GENERIC_BUSINESS_NAMES = new Set(["home", "homepage", "welcome", "contact", "about", "services", "our services"])

const LABELS = {
  phone: ["phone", "tel", "telephone", "טלפון"],
  mobile: ["mobile", "cellphone", "cell", "נייד", "פלאפון"],
  email: ["email", "mail", "e-mail", "אימייל", "דוא\"ל", "דואל"],
  name: ["name", "full name", "contact", "owner", "manager", "שם", "שם מלא", "איש קשר"],
  first_name: ["first name", "שם פרטי"],
  last_name: ["last name", "שם משפחה"],
  address: ["address", "location", "כתובת", "מען"],
  city: ["city", "עיר"],
  business: ["company", "organization", "business", "חברה", "עסק", "ארגון"],
  category: ["category", "industry", "service", "תחום", "קטגוריה", "title", "role", "position"],
}

type Evidence = {
  source: "link" | "label" | "html" | "deobfuscated" | "script"
  snippet: string
}

const EMAIL_AT_DOT_PATTERNS: Array<[RegExp, string]> = [
  [/\s*\[\s*at\s*]\s*/gi, "@"],
  [/\s*\(\s*at\s*\)\s*/gi, "@"],
  [/\s+at\s+/gi, "@"],
  [/\s*\[\s*@\s*]\s*/gi, "@"],
  [/\s*\(\s*@\s*\)\s*/gi, "@"],
  [/\s*\[\s*dot\s*]\s*/gi, "."],
  [/\s*\(\s*dot\s*\)\s*/gi, "."],
  [/\s+dot\s+/gi, "."],
]

function text(v: unknown): string {
  return String(v || "").replace(/\s+/g, " ").trim()
}

function first(...vals: Array<unknown>): string {
  for (const v of vals) {
    const t = text(v)
    if (t) return t
  }
  return ""
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => text(v)).filter(Boolean)))
}

function normalizeUnicodeDigits(input: string): string {
  const map: Record<string, string> = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
  }
  return String(input || "")
    .split("")
    .map((ch) => map[ch] || ch)
    .join("")
}

function normalizeEmailText(input: string): string {
  let value = String(input || "")
  value = normalizeUnicodeDigits(value)
  for (const [pattern, replacement] of EMAIL_AT_DOT_PATTERNS) {
    value = value.replace(pattern, replacement)
  }
  return value
}

function rot13(input: string): string {
  return String(input || "").replace(/[A-Za-z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function tryBase64Decode(input: string): string {
  const raw = text(input).replace(/^mailto:/i, "")
  if (!/^[A-Za-z0-9+/=]+$/.test(raw) || raw.length < 8) return ""
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8")
    return decoded
  } catch {
    return ""
  }
}

function decodeCloudflareEmail(hex: string): string {
  const cleaned = String(hex || "").trim()
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length < 4) return ""
  try {
    const key = Number.parseInt(cleaned.slice(0, 2), 16)
    let out = ""
    for (let i = 2; i < cleaned.length; i += 2) {
      const code = Number.parseInt(cleaned.slice(i, i + 2), 16) ^ key
      out += String.fromCharCode(code)
    }
    return out
  } catch {
    return ""
  }
}

function wordsToDigits(raw: string): string {
  const dict: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
  }
  const normalized = String(raw || "").toLowerCase()
  const replaced = normalized.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (m) => dict[m] || m)
  return replaced
}

function isGenericBusinessName(value: string): boolean {
  const v = text(value).toLowerCase()
  return !v || v.length > 90 || GENERIC_BUSINESS_NAMES.has(v)
}

function parseMailto(href: string): string {
  return text(href.replace(/^mailto:/i, "").split("?")[0]).toLowerCase()
}

function parseTel(href: string): string {
  return text(href.replace(/^tel:/i, "").split("?")[0])
}

function parseWhatsappPhone(href: string): string {
  const raw = text(href)
  const urlPhone = raw.match(/(?:wa\.me\/|phone=)(\+?\d[\d-]{6,})/i)
  return text((urlPhone?.[1] || "").replace(/[^\d+]/g, ""))
}

function extractEmailsFromText(content: string): string[] {
  const normalized = normalizeEmailText(content)
  const matches = normalized.match(EMAIL_REGEX) || []
  return uniq(matches.map((m) => m.toLowerCase()))
}

function extractPhonesFromText(content: string): string[] {
  const normalized = normalizeUnicodeDigits(wordsToDigits(content))
  const matches = normalized.match(PHONE_REGEX) || []
  return uniq(
    matches
      .map((m) => m.replace(/\s+/g, " ").trim())
      .filter((m) => {
        const digits = m.replace(/[^\d]/g, "")
        return digits.length >= 7 && digits.length <= 12
      })
  )
}

function extractEmailsFromAttributes($: cheerio.CheerioAPI): string[] {
  const out: string[] = []
  $("[data-email],[data-user],[data-domain],[data-cfemail]").each((_, el) => {
    const node = $(el)
    const dataEmail = text(node.attr("data-email"))
    const dataUser = text(node.attr("data-user"))
    const dataDomain = text(node.attr("data-domain"))
    const cf = text(node.attr("data-cfemail"))

    if (dataEmail) out.push(dataEmail)
    if (dataUser && dataDomain) out.push(`${dataUser}@${dataDomain}`)
    if (cf) out.push(decodeCloudflareEmail(cf))
  })
  return extractEmailsFromText(out.join(" "))
}

function extractEmailsFromScripts(html: string): string[] {
  const candidates: string[] = []
  const scriptLike = String(html || "")

  const cfPathMatches = Array.from(scriptLike.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g))
  for (const m of cfPathMatches) {
    candidates.push(decodeCloudflareEmail(m[1] || ""))
  }

  const b64Matches = Array.from(scriptLike.matchAll(/(?:atob\(|fromCharCode\()([^)]{5,240})\)/g))
  for (const m of b64Matches) {
    const raw = String(m[1] || "").replace(/['"`]/g, "").trim()
    candidates.push(tryBase64Decode(raw))
    candidates.push(rot13(raw))
  }

  const inlineData = Array.from(scriptLike.matchAll(/(?:user|email|mail)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi))
  for (const m of inlineData) candidates.push(m[1] || "")

  return extractEmailsFromText(candidates.join(" "))
}

function extractPhonesFromOnClick($: cheerio.CheerioAPI): string[] {
  const values: string[] = []
  $("[onclick]").each((_, el) => {
    const onclick = text($(el).attr("onclick"))
    values.push(...extractPhonesFromText(onclick))
  })
  return uniq(values)
}

function sanitizeAddress(value: string): string {
  const v = text(value)
  if (!v) return ""
  if (v.length > 160) return ""
  return v
}

function isShortCity(value: string): boolean {
  const v = text(value)
  if (!v || v.length > 40) return false
  const words = v.split(/\s+/g).filter(Boolean)
  if (words.length < 1 || words.length > 3) return false
  if (/\d/.test(v)) return false
  return true
}

function looksPersonName(value: string): boolean {
  const v = text(value)
  if (!v) return false
  if (v.length < 3 || v.length > 60) return false
  if (/\d/.test(v)) return false
  const words = v.split(/\s+/g).filter(Boolean)
  return words.length >= 2 && words.length <= 4
}

function hasLabel(label: string, values: string[]): boolean {
  const l = label.toLowerCase()
  return values.some((v) => l.includes(v))
}

function splitLabelValue(line: string): { label: string; value: string } | null {
  const m = text(line).match(/^([^:]{2,40})[:\-]\s*(.{2,})$/)
  if (!m) return null
  return { label: text(m[1]).toLowerCase(), value: text(m[2]) }
}

function collectLabeledPairs($: cheerio.CheerioAPI): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = []

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th,td")
    if (cells.length < 2) return
    const label = text($(cells[0]).text()).toLowerCase()
    const value = text($(cells[1]).text())
    if (label && value) pairs.push({ label, value })
  })

  $("dl").each((_, dl) => {
    const dtNodes = $(dl).find("dt")
    dtNodes.each((idx, dt) => {
      const dd = $(dl).find("dd").eq(idx)
      const label = text($(dt).text()).toLowerCase()
      const value = text(dd.text())
      if (label && value) pairs.push({ label, value })
    })
  })

  $("li,p,div,span").each((_, el) => {
    const parsed = splitLabelValue(text($(el).text()))
    if (parsed) pairs.push(parsed)
  })

  return pairs
}

function pickFromPairs(
  pairs: Array<{ label: string; value: string }>,
  labels: string[],
  validator?: (value: string) => boolean
): string {
  for (const pair of pairs) {
    if (!hasLabel(pair.label, labels)) continue
    if (validator && !validator(pair.value)) continue
    return pair.value
  }
  return ""
}

function evidenceToDebug(key: string, evidence: Evidence | null): string {
  if (!evidence) return `${key}=`
  return `${key}=${evidence.source}:${text(evidence.snippet).slice(0, 70)}`
}

function extractTopNavTopics($: cheerio.CheerioAPI): string {
  const links = $("nav a, header nav a, [role='navigation'] a")
    .toArray()
    .map((el) => text($(el).text()))
    .filter((v) => v.length >= 3 && v.length <= 40)
  return uniq(links).slice(0, 8).join(" | ")
}

function pickWithEvidence(values: string[], source: Evidence["source"]): { value: string; evidence: Evidence | null } {
  const winner = first(...values)
  if (!winner) return { value: "", evidence: null }
  return {
    value: winner,
    evidence: {
      source,
      snippet: winner,
    },
  }
}

function buildContactFromBlock($: cheerio.CheerioAPI, block: unknown, fallbackBusiness: string, pageUrl: string) {
  const node = $(block as any)
  const blockText = text(node.text())
  if (!blockText || blockText.length < 20) return null

  const email = first(
    parseMailto(node.find("a[href^='mailto:']").first().attr("href") || ""),
    ...extractEmailsFromText(blockText)
  )
  const phone = first(
    parseTel(node.find("a[href^='tel:']").first().attr("href") || ""),
    ...extractPhonesFromText(blockText)
  )
  const nameCandidate = first(
    text(node.find("h1,h2,h3,h4,strong,b,[class*='name']").first().text()),
    text(node.find("[itemprop='name']").first().text())
  )
  const fullName = looksPersonName(nameCandidate) ? nameCandidate : ""
  const title = text(node.find("[class*='title'],[class*='role'],[itemprop='jobTitle']").first().text())
  const address = sanitizeAddress(text(node.find("address,[itemprop='address']").first().text()))
  const cityRaw = text(node.find("[itemprop='addressLocality'],[class*='city']").first().text())
  const city = isShortCity(cityRaw) ? cityRaw : ""

  const signalCount = Number(Boolean(email)) + Number(Boolean(phone)) + Number(Boolean(fullName || title))
  if (signalCount < 2) return null

  const notes = `source:block; block_preview:${blockText.slice(0, 100)}`
  return {
    full_name: fullName,
    business_name: fallbackBusiness,
    email,
    phone,
    address,
    city,
    category: title,
    extraction_method: "team-grid",
    confidence_score: signalCount >= 3 ? 0.82 : 0.68,
    notes,
    website: pageUrl,
  }
}

function extractMultiContacts($: cheerio.CheerioAPI, fallbackBusiness: string, pageUrl: string) {
  const blocks = $("article, .card, .team-member, .staff-member, .person, li, tr")
  const contacts: Array<NonNullable<FieldExtraction["contacts"]>[number]> = []
  blocks.each((_, el) => {
    const contact = buildContactFromBlock($, el, fallbackBusiness, pageUrl)
    if (contact) contacts.push(contact)
  })
  return contacts.slice(0, 40)
}

export function parseContactFieldsFromHtml(html: string, pageUrl: string): FieldExtraction {
  const $ = cheerio.load(html || "")

  const mailtoLinks = uniq(
    $("a[href^='mailto:']")
      .toArray()
      .map((el) => parseMailto($(el).attr("href") || ""))
  )
  const telLinks = uniq(
    $("a[href^='tel:']")
      .toArray()
      .map((el) => parseTel($(el).attr("href") || ""))
  )
  const whatsappPhones = uniq(
    $("a[href*='wa.me'],a[href*='whatsapp']")
      .toArray()
      .map((el) => parseWhatsappPhone($(el).attr("href") || ""))
  )

  const bodyWithoutScripts = $("body").clone()
  bodyWithoutScripts.find("script,style,noscript").remove()
  const pageText = text(bodyWithoutScripts.text())
  const emailMatches = extractEmailsFromText(pageText)
  const phoneMatches = extractPhonesFromText(pageText)
  const pairs = collectLabeledPairs($)

  const emailFromLabel = pickFromPairs(pairs, LABELS.email, (value) => extractEmailsFromText(value).length > 0)
  const phoneFromLabel = pickFromPairs(pairs, LABELS.phone, (value) => extractPhonesFromText(value).length > 0)
  const mobileFromLabel = pickFromPairs(pairs, LABELS.mobile, (value) => extractPhonesFromText(value).length > 0)

  const attrsEmails = extractEmailsFromAttributes($)
  const scriptEmails = extractEmailsFromScripts(html)
  const onclickPhones = extractPhonesFromOnClick($)

  const title = text($("title").first().text())
  const h1 = text($("h1").first().text())
  const metaDescription = text($("meta[name='description']").attr("content"))
  const appName = text($("meta[name='application-name']").attr("content"))
  const navTopics = extractTopNavTopics($)
  const logoName = text($("header [class*='logo'], [class*='brand']").first().text())
  const businessNameRaw = first(
    text($("meta[property='og:site_name']").attr("content")),
    appName,
    pickFromPairs(pairs, LABELS.business),
    text($("[itemprop='name']").first().text()),
    logoName,
    h1
  )
  const businessName = isGenericBusinessName(businessNameRaw) ? "" : businessNameRaw

  const emailPick = pickWithEvidence(
    [emailFromLabel, ...mailtoLinks, ...attrsEmails, ...scriptEmails, ...emailMatches],
    emailFromLabel ? "label" : mailtoLinks[0] ? "link" : attrsEmails[0] || scriptEmails[0] ? "deobfuscated" : "html"
  )
  const mobilePick = pickWithEvidence([mobileFromLabel], "label")
  const phonePick = pickWithEvidence(
    [phoneFromLabel, ...telLinks, ...whatsappPhones, ...onclickPhones, ...phoneMatches],
    phoneFromLabel ? "label" : telLinks[0] || whatsappPhones[0] ? "link" : onclickPhones[0] ? "script" : "html"
  )

  const addressRaw = first(
    text($("address").first().text()),
    pickFromPairs(pairs, LABELS.address),
    text($("[itemprop='streetAddress']").first().text())
  )
  const address = sanitizeAddress(addressRaw)

  const cityRaw = first(
    pickFromPairs(pairs, LABELS.city),
    text($("[itemprop='addressLocality']").first().text()),
    text($("[class*='city']").first().text())
  )
  const city = isShortCity(cityRaw) ? cityRaw : ""

  const fullNameRaw = first(pickFromPairs(pairs, LABELS.name), text($("[itemprop='employee'],[itemprop='founder']").first().text()))
  const fullName = looksPersonName(fullNameRaw) ? fullNameRaw : ""

  const firstName = pickFromPairs(pairs, LABELS.first_name, looksPersonName)
  const lastName = pickFromPairs(pairs, LABELS.last_name, (v) => text(v).length >= 2 && text(v).length <= 30)
  const category = first(text($("[itemprop='category']").first().text()), pickFromPairs(pairs, LABELS.category), navTopics)

  const email = emailPick.value
  const phone = phonePick.value
  const mobile = mobilePick.value
  const website = first(text($("link[rel='canonical']").attr("href")), pageUrl)
  const contacts = extractMultiContacts($, businessName, website || pageUrl)

  const notesBits: string[] = []
  if (mailtoLinks.length > 0) notesBits.push("found:mailto")
  if (telLinks.length > 0) notesBits.push("found:tel")
  if (whatsappPhones.length > 0) notesBits.push("found:whatsapp_phone")
  if ($("script[type='application/ld+json']").length > 0) notesBits.push("found:jsonld")
  if (pairs.length > 0) notesBits.push(`found:labeled_pairs:${Math.min(pairs.length, 20)}`)
  if (attrsEmails.length > 0) notesBits.push("found:data_email")
  if (scriptEmails.length > 0) notesBits.push("found:script_email")
  if (onclickPhones.length > 0) notesBits.push("found:onclick_phone")
  if (contacts.length > 1) notesBits.push(`found:multi_contacts:${contacts.length}`)
  if (metaDescription) notesBits.push("found:meta_description")
  if (navTopics) notesBits.push("found:nav_topics")
  if (businessName) notesBits.push("found:site_identity")

  const hasContactSignals = Boolean(email || phone || mobile || fullName)
  const hasSiteSignals = Boolean(title && businessName && website)
  const confidence = hasContactSignals ? 0.72 : hasSiteSignals ? 0.58 : 0.42
  const mergedNotes = notesBits.join("; ")
  const notes = metaDescription
    ? [mergedNotes, `meta_description:${metaDescription.slice(0, 140)}`].filter(Boolean).join("; ")
    : mergedNotes

  return {
    page_title: title,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    business_name: businessName,
    phone,
    mobile,
    email,
    website,
    address,
    city,
    category,
    notes,
    contacts,
    debug: [
      evidenceToDebug("evidence_email", emailPick.evidence),
      evidenceToDebug("evidence_phone", phonePick.evidence),
      evidenceToDebug("evidence_mobile", mobilePick.evidence),
      `evidence_address=${address ? `label:${address.slice(0, 70)}` : ""}`,
      `evidence_city=${city ? `label:${city}` : ""}`,
      `evidence_business=${businessName ? `label:${businessName.slice(0, 70)}` : ""}`,
      `evidence_name=${fullName ? `label:${fullName}` : ""}`,
      `evidence_contacts_count=${contacts.length}`,
    ],
    extraction_method: "static_html",
    confidence_score: confidence,
  }
}
