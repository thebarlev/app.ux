export type AdminReport = {
  score_total: number
  score_search: number
  score_ai: number
  score_breakdown: Record<string, number>
  category_scores: Record<string, number>
  ai_readiness_summary?: {
    average_score: number
    pages_analyzed: number
    top_strengths: string[]
    top_gaps: string[]
  }
  recommendations_count?: number
  top_recommendations?: string[]
  rules: Array<{
    rule_key: string
    category: string
    status: string
    impact: string
    effort: string
    recommendation_he: string
    evidence: unknown
  }>
  coverage: { total_pages: number; extracted_pages: number }
  confidence: { level: string; warning?: string }
  issues_overview: string[]
}

export function buildAdminReport(params: {
  score_total: number
  score_search: number
  score_ai: number
  score_breakdown: Record<string, number>
  category_scores: Record<string, number>
  rules: Array<{
    rule_key: string
    category: string
    status: string
    impact: string
    effort: string
    recommendation_he: string
    evidence: unknown
  }>
  total_pages: number
  extracted_pages: number
  confidence_level: string
  warning?: string
  issues_overview: string[]
}): AdminReport {
  return {
    score_total: params.score_total,
    score_search: params.score_search,
    score_ai: params.score_ai,
    score_breakdown: params.score_breakdown,
    category_scores: params.category_scores,
    rules: params.rules.map((r) => ({
      rule_key: r.rule_key,
      category: r.category,
      status: r.status,
      impact: r.impact,
      effort: r.effort,
      recommendation_he: r.recommendation_he,
      evidence: r.evidence,
    })),
    coverage: { total_pages: params.total_pages, extracted_pages: params.extracted_pages },
    confidence: { level: params.confidence_level, warning: params.warning },
    issues_overview: params.issues_overview,
  }
}
