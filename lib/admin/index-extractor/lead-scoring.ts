import type { ExtractedRow, LeadGrade, LeadSignals, PageDebugInfo } from "@/lib/admin/index-extractor/types"

function toNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function detectDirectoryLike(row: ExtractedRow): boolean {
  const url = String(row.page_url || "").toLowerCase()
  const title = String(row.page_title || "").toLowerCase()
  const badPathHints = ["/directory", "/listing", "/category", "/tag", "/search", "/author", "/page/"]
  if (badPathHints.some((hint) => url.includes(hint))) return true
  return ["directory", "listing", "results", "top 10", "best of"].some((hint) => title.includes(hint))
}

function detectSocialLike(row: ExtractedRow): boolean {
  const domain = String(row.source_domain || "").toLowerCase()
  const social = ["facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "youtube.com", "tiktok.com"]
  return social.some((hint) => domain.includes(hint))
}

function detectContactPage(row: ExtractedRow): boolean {
  const url = String(row.page_url || "").toLowerCase()
  const title = String(row.page_title || "").toLowerCase()
  return ["contact", "about", "team", "support", "company", "שירות", "צור קשר", "אודות"].some(
    (hint) => url.includes(hint) || title.includes(hint)
  )
}

function detectBusinessKeywords(row: ExtractedRow): boolean {
  const title = String(row.page_title || "").toLowerCase()
  const notes = String(row.notes || "").toLowerCase()
  return ["business", "company", "services", "agency", "clinic", "חברה", "עסק", "שירות"].some(
    (hint) => title.includes(hint) || notes.includes(hint)
  )
}

function buildLeadSignals(row: ExtractedRow, pageDebug: PageDebugInfo): LeadSignals {
  const hasEmail = Boolean(String(row.email || "").trim())
  const hasPhone = Boolean(String(row.phone || "").trim())
  const hasMobile = Boolean(String(row.mobile || "").trim())
  const hasFullName = Boolean(String(row.full_name || "").trim())
  const hasAddress = Boolean(String(row.address || "").trim())
  const hasBusinessDomain = Boolean(String(row.source_domain || "").trim())
  const hasContactPage = detectContactPage(row)
  const hasBusinessKeywords = detectBusinessKeywords(row)
  const isDirectoryOrListing = detectDirectoryLike(row)
  const isSocialLike = detectSocialLike(row)
  const isThinPage = (pageDebug.html_length || 0) > 0 && (pageDebug.html_length || 0) < 2000

  return {
    has_email: hasEmail,
    has_phone: hasPhone,
    has_mobile: hasMobile,
    has_full_name: hasFullName,
    has_address: hasAddress,
    has_contact_page: hasContactPage,
    has_business_domain: hasBusinessDomain,
    has_business_keywords: hasBusinessKeywords,
    has_multiple_contact_signals: Number(hasEmail) + Number(hasPhone || hasMobile) + Number(hasAddress) >= 2,
    is_directory_or_listing: isDirectoryOrListing,
    is_social_like: isSocialLike,
    is_thin_page: isThinPage,
  }
}

function computeLeadScore(signals: LeadSignals): number {
  let score = 20
  if (signals.has_email) score += 20
  if (signals.has_phone) score += 14
  if (signals.has_mobile) score += 14
  if (signals.has_full_name) score += 10
  if (signals.has_address) score += 8
  if (signals.has_contact_page) score += 6
  if (signals.has_business_domain) score += 4
  if (signals.has_business_keywords) score += 6
  if (signals.has_multiple_contact_signals) score += 8

  if (signals.is_directory_or_listing) score -= 18
  if (signals.is_social_like) score -= 12
  if (signals.is_thin_page) score -= 8

  return toNumber(score, 0, 100)
}

function scoreToGrade(score: number): LeadGrade {
  if (score >= 80) return "A"
  if (score >= 60) return "B"
  if (score >= 40) return "C"
  return "D"
}

function buildSummary(grade: LeadGrade, signals: LeadSignals): string {
  const positives: string[] = []
  if (signals.has_email) positives.push("email")
  if (signals.has_phone || signals.has_mobile) positives.push("phone")
  if (signals.has_full_name) positives.push("name")
  if (signals.has_address) positives.push("address")
  if (positives.length === 0) return `Lead ${grade}: low signal confidence`
  return `Lead ${grade}: ${positives.slice(0, 3).join(", ")}`
}

export function scoreLeadForRow(row: ExtractedRow, pageDebug: PageDebugInfo): {
  lead_score: number
  lead_grade: LeadGrade
  lead_signals: LeadSignals
  lead_summary: string
} {
  const leadSignals = buildLeadSignals(row, pageDebug)
  const leadScore = computeLeadScore(leadSignals)
  const leadGrade = scoreToGrade(leadScore)
  return {
    lead_score: leadScore,
    lead_grade: leadGrade,
    lead_signals: leadSignals,
    lead_summary: buildSummary(leadGrade, leadSignals),
  }
}
