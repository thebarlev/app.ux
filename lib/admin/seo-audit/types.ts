export type SeoIssueSeverity = "critical" | "warning" | "info"

export type SeoIssue = {
  severity: SeoIssueSeverity
  code: string
  message: string
  details?: string
}

export type SeoCanonicalReport = {
  exists: boolean
  count: number
  value: string
  matches_page_url: boolean
  duplicate_with: string | null
}

export type SeoHreflangEntry = {
  lang: string
  href: string
  valid: boolean
}

export type SeoHreflangReport = {
  exists: boolean
  valid_structure: boolean
  has_he_il: boolean
  has_en: boolean
  reciprocal_ok: boolean
  entries: SeoHreflangEntry[]
}

export type SeoRobotsReport = {
  meta: string
  noindex: boolean
  nofollow: boolean
  potentially_incorrect_noindex: boolean
}

export type SeoTextTagReport = {
  exists: boolean
  value: string
  length: number
  too_short: boolean
  too_long: boolean
  duplicate_with: string | null
}

export type SeoH1Report = {
  count: number
  values: string[]
}

export type SeoImageReport = {
  total: number
  missing_alt: number
}

export type SeoInternalLinksReport = {
  total: number
  unique_internal: number
  broken_internal_count: number
  broken_internal_urls: string[]
}

export type SeoRedirectReport = {
  redirect_count: number
  has_chain: boolean
  possible_loop: boolean
  final_url: string
}

export type SeoPageReport = {
  url: string
  isMoneyPage: boolean
  status: number
  depth: number
  response_time_ms: number
  html_size_bytes: number
  canonical: SeoCanonicalReport
  hreflang: SeoHreflangReport
  robots: SeoRobotsReport
  title: SeoTextTagReport
  description: SeoTextTagReport
  h1: SeoH1Report
  schemaTypes: string[]
  images: SeoImageReport
  internalLinks: SeoInternalLinksReport
  redirect: SeoRedirectReport
  issues: SeoIssue[]
}

export type SeoSitemapUrlCheck = {
  url: string
  status: number | null
  blocked_pattern: boolean
}

export type SeoSitemapReport = {
  fetched: boolean
  sitemap_url: string
  total_urls: number
  checked_urls: SeoSitemapUrlCheck[]
  issues: SeoIssue[]
}

export type SeoScoreBreakdown = {
  technical: number
  content: number
  structure: number
  performance: number
}

export type SeoAuditSummary = {
  score: number
  pagesScanned: number
  issues: number
  breakdown: SeoScoreBreakdown
}

export type SeoAuditResponse = {
  summary: SeoAuditSummary
  pages: SeoPageReport[]
  sitemap: SeoSitemapReport
  criticalIssues: SeoIssue[]
  warnings: SeoIssue[]
  recommendations: SeoActionableRecommendation[]
  growthOpportunities: SeoGrowthOpportunity[]
  quickWins: SeoActionableRecommendation[]
  biggestIssues: SeoActionableRecommendation[]
}

export type SeoRecommendationSeverity = "critical" | "high" | "medium" | "low"
export type SeoFixComplexity = "low" | "medium" | "high"
export type SeoBusinessImpact = "low" | "medium" | "high"
export type SeoRecommendationGroup = "Technical SEO fixes" | "Content improvements" | "Structure & linking" | "Performance" | "Growth opportunities"

export type SeoActionableRecommendation = {
  issue: string
  severity: SeoRecommendationSeverity
  affectedPages: number
  whyItMatters: string
  howToFix: string
  exampleFix: string
  devComplexity: SeoFixComplexity
  impact: SeoBusinessImpact
  group: SeoRecommendationGroup
}

export type SeoGrowthOpportunity = {
  title: string
  rationale: string
  affectedPages: number
  opportunityScore: number
  suggestedAction: string
  examples: string[]
}

export type SeoAuditRequestInput = {
  url: string
  maxPages?: number
}

export type SeoCrawlPage = {
  url: string
  finalUrl: string
  status: number
  html: string
  depth: number
  responseTimeMs: number
  htmlSizeBytes: number
  redirectCount: number
}

export type SeoCrawlResult = {
  pages: SeoCrawlPage[]
  discoveredUrls: string[]
  stopReason?: "max_pages" | "max_runtime"
}

export type SeoAuditRunOptions = {
  maxPages: number
  maxRuntimeMs: number
  fetchTimeoutMs: number
  maxHtmlBytes: number
  userAgent: string
}

export const SEO_AUDIT_DEFAULT_OPTIONS: SeoAuditRunOptions = {
  maxPages: 50,
  maxRuntimeMs: 60_000,
  fetchTimeoutMs: 8_000,
  maxHtmlBytes: 1_200_000,
  userAgent: "VOW-SEO-Audit/1.0 (+https://app.uxellent.com)",
}

export const SEO_AUDIT_CSV_HEADERS = [
  "url",
  "status",
  "depth",
  "score_flags",
  "title",
  "title_length",
  "description",
  "description_length",
  "h1_count",
  "canonical",
  "canonical_matches_url",
  "hreflang_count",
  "robots_noindex",
  "schema_types",
  "missing_alt_images",
  "internal_links",
  "broken_internal_links",
  "response_time_ms",
  "html_size_bytes",
  "issues_count",
] as const

export type SeoAuditCsvHeader = (typeof SEO_AUDIT_CSV_HEADERS)[number]
