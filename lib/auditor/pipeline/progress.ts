const STEP_WEIGHTS: Record<string, number> = {
  normalize: 5,
  robots: 10,
  sitemap: 15,
  ai_files: 20,
  sample: 25,
  fetch_pages: 35,
  extract: 45,
  keyword_analysis: 55,
  keyword_engine: 55,
  topic_discovery: 60,
  rules: 70,
  ai_readiness: 75,
  competitor_discovery: 80,
  competitor_crawl: 85,
  competitor_keywords: 88,
  content_gap_analysis: 92,
  recommendations: 96,
  persist: 99,
  done: 100,
}

export function computeProgress(step: string | null | undefined): number {
  return STEP_WEIGHTS[String(step || "normalize")] ?? 0
}
