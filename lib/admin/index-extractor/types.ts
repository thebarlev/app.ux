export const INDEX_EXTRACTOR_CSV_HEADERS = [
  "source_url",
  "source_domain",
  "page_url",
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
  "extracted_at",
  "status",
  "confidence_score",
] as const

export type IndexExtractorCsvHeader = (typeof INDEX_EXTRACTOR_CSV_HEADERS)[number]

export type ExtractionMethod = "static_html" | "rendered_html" | "json_api" | string
export type ExtractionStatus = "success" | "partial" | "failed" | "skipped"

export type LeadGrade = "A" | "B" | "C" | "D"

export type LeadSignals = {
  has_email: boolean
  has_phone: boolean
  has_mobile: boolean
  has_full_name: boolean
  has_address: boolean
  has_contact_page: boolean
  has_business_domain: boolean
  has_business_keywords: boolean
  has_multiple_contact_signals: boolean
  is_directory_or_listing: boolean
  is_social_like: boolean
  is_thin_page: boolean
}

export type ExtractedRow = Record<IndexExtractorCsvHeader, string> & {
  lead_score?: number
  lead_grade?: LeadGrade
  lead_summary?: string
  lead_signals?: LeadSignals
}

export type CrawlError = {
  source_url: string
  page_url?: string
  code: string
  message: string
}

export type CrawlSkipped = {
  source_url: string
  page_url?: string
  reason: string
}

export type PageDebugStatus = "success" | "failed" | "skipped" | "error"

export type PageDebugInfo = {
  source_url: string
  source_domain: string
  page_url: string
  status: PageDebugStatus
  skip_reason: string | null
  error_reason: string | null
  extraction_method_attempted: string[]
  http_status: number | null
  content_type: string | null
  html_length: number | null
  truncated_body_length: number | null
  discovered_links_count: number
  fields_found_count: number
  url_validation: "passed" | "failed" | "not_checked"
  domain_policy: "allowed" | "blocked"
  robots_allowed: boolean | null
  robots_reason: string | null
  structured_data_detected_static: boolean | null
  structured_data_detected_rendered: boolean | null
  rendered_fallback_decision: "not_requested" | "not_triggered" | "triggered"
  rendered_fallback_result: "not_attempted" | "success" | "failed"
  final_stop_reason: string
  search_source: "google_query" | null
  search_engine: "google_cse" | "serper" | null
  search_query: string | null
  search_rank: number | null
  lead_score?: number
  lead_grade?: LeadGrade
  lead_summary?: string
  lead_signals?: LeadSignals
}

export type RunSummary = {
  total_sources: number
  total_pages_attempted: number
  total_rows: number
  total_skipped: number
  total_errors: number
  stopped_reason?: "runtime_limit" | "page_limit"
}

export type RunResult = {
  rows: ExtractedRow[]
  errors: CrawlError[]
  skipped: CrawlSkipped[]
  page_debug: PageDebugInfo[]
  search_diagnostics?: SearchDiagnostics
  summary: RunSummary
}

export type SearchSourceMeta = {
  search_source?: "google_query"
  search_engine?: "google_cse" | "serper"
  search_query?: string
  search_rank?: number | null
  search_title?: string
  search_snippet?: string
}

export type SourceInput = {
  sourceUrl: string
  sourceLabel?: string
  crawlLimitPerSource?: number
  sourceMeta?: SearchSourceMeta
}

export type RunInput = {
  mode?: "manual" | "google_search"
  sources: SourceInput[]
  maxPagesToVisit?: number
  followInternalLinks?: boolean
  useRenderedFallback?: boolean
  googleQuery?: string
  googleResultLimit?: number
  googleCountry?: string
  googleLanguage?: string
  internalLinkMaxDepth?: number
  internalLinkMaxPagesPerDomain?: number
}

export type RelevanceEvaluation = {
  relevance_score: number
  relevance_reasons: string[]
  filtered_out: boolean
  filtered_out_reason?: string
}

export type SearchCandidateDiagnostic = {
  url: string
  domain: string
  rank: number | null
  search_engine: "google_cse" | "serper"
  search_source: "google_query"
  title?: string
  snippet?: string
  relevance_score: number
  relevance_reasons: string[]
  filtered_out: boolean
  filtered_out_reason?: string
}

export type SearchDiagnostics = {
  mode: "manual" | "google_search"
  query?: string
  engine_requested?: "google_cse"
  engine_used?: "google_cse" | "serper" | "none"
  candidate_count_raw?: number
  candidate_count_normalized?: number
  candidate_count_deduped?: number
  candidate_count_filtered_in?: number
  candidate_count_filtered_out?: number
  crawl_seed_count?: number
  candidate_count?: number
  deduped_count?: number
  fallback_used?: boolean
  warnings?: string[]
  errors?: string[]
  timings?: {
    search_ms?: number
    filter_ms?: number
    total_ms?: number
  }
  candidates?: SearchCandidateDiagnostic[]
}

export type RuntimeCaps = {
  maxTotalPages: number
  maxSeeds: number
  maxRuntimeMs: number
}

export type FieldExtraction = {
  page_title?: string
  full_name?: string
  first_name?: string
  last_name?: string
  business_name?: string
  phone?: string
  mobile?: string
  email?: string
  website?: string
  address?: string
  city?: string
  category?: string
  notes?: string
  extraction_method?: ExtractionMethod
  confidence_score?: number
  debug?: string[]
  contacts?: Array<{
    full_name?: string
    business_name?: string
    email?: string
    phone?: string
    mobile?: string
    address?: string
    city?: string
    category?: string
    notes?: string
    confidence_score?: number
    extraction_method?: string
  }>
}

export type AdapterContext = {
  sourceUrl: string
  sourceDomain: string
  pageUrl: string
  html: string
  useRenderedFallback: boolean
}

export type IndexExtractorAdapter = {
  id: string
  match: (hostname: string) => boolean
  extract: (ctx: AdapterContext) => Promise<FieldExtraction>
}
