export type ArchitectureLead = {
  domain: string
  company_name: string
  website: string
  email: string
  phone: string
  location: string
}

export type ArchitectureCrawlerInput = {
  targetCount?: number
}

export type ArchitectureCrawlerSummary = {
  target_count: number
  candidate_urls: number
  candidate_domains: number
  crawled_domains: number
  leads_found: number
  saved_to_db: number
  filtered_enterprise: number
  stopped_reason?: "target_reached" | "runtime_limit" | "domain_limit"
}

export type ArchitectureCrawlerResult = {
  leads: ArchitectureLead[]
  summary: ArchitectureCrawlerSummary
  warnings: string[]
}
