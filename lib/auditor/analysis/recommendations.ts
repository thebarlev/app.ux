import type { SupabaseClient } from "@supabase/supabase-js"

type TopicRow = {
  topic: string
  coverage_score: number | null
  missing_pages: number | null
}

type PageRow = {
  id: string
  url: string
  title: string | null
  jsonld_types: string[] | null
  extracted: Record<string, unknown> | null
  ai_analysis: Record<string, unknown> | null
}

type RuleRow = {
  rule_key: string
  status: string
}

type RecommendationPriority = "low" | "medium" | "high"

function priorityFromScore(score: number): RecommendationPriority {
  if (score >= 75) return "high"
  if (score >= 45) return "medium"
  return "low"
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function generateRecommendations(params: {
  supabase: SupabaseClient
  scanId: string
}) {
  const { supabase, scanId } = params

  const [
    { data: topics, error: topicsError },
    { data: pages, error: pagesError },
    { data: rules, error: rulesError },
    { data: keywords, error: keywordsError },
    { data: contentGaps, error: contentGapsError },
    { data: competitors, error: competitorsError },
  ] = await Promise.all([
    supabase.from("auditor_topics").select("topic,coverage_score,missing_pages").eq("scan_id", scanId).order("coverage_score", { ascending: false }),
    supabase
      .from("auditor_scan_pages")
      .select("id,url,title,jsonld_types,extracted,ai_analysis")
      .eq("scan_id", scanId)
      .eq("state", "extracted"),
    supabase.from("auditor_scan_rules").select("rule_key,status").eq("scan_id", scanId),
    supabase.from("auditor_keywords").select("keyword,keyword_type").eq("scan_id", scanId),
    supabase.from("auditor_content_gaps").select("keyword,topic,priority,competitor_count,evidence").eq("scan_id", scanId).order("competitor_count", { ascending: false }),
    supabase.from("auditor_competitors").select("domain").eq("scan_id", scanId).limit(5),
  ])
  if (topicsError) throw new Error(`generateRecommendations topics query failed: ${topicsError.message}`)
  if (pagesError) throw new Error(`generateRecommendations pages query failed: ${pagesError.message}`)
  if (rulesError) throw new Error(`generateRecommendations rules query failed: ${rulesError.message}`)
  if (keywordsError) throw new Error(`generateRecommendations keywords query failed: ${keywordsError.message}`)
  if (contentGapsError) throw new Error(`generateRecommendations content gaps query failed: ${contentGapsError.message}`)
  if (competitorsError) throw new Error(`generateRecommendations competitors query failed: ${competitorsError.message}`)

  const topicRows = (topics ?? []) as TopicRow[]
  const pageRows = (pages ?? []) as PageRow[]
  const ruleRows = (rules ?? []) as RuleRow[]
  const keywordRows = (keywords ?? []) as Array<{ keyword: string; keyword_type: string }>
  const contentGapRows = (contentGaps ?? []) as Array<{ keyword: string; topic: string | null; priority: string; competitor_count: number | null; evidence?: Record<string, unknown> }>
  const competitorRows = (competitors ?? []) as Array<{ domain: string }>

  const recommendations: Array<{
    type: string
    priority: RecommendationPriority
    title: string
    description: string
    action: string
  }> = []

  const weakestTopic = topicRows
    .filter((topic) => numberValue(topic.missing_pages) > 0)
    .sort((a, b) => numberValue(b.missing_pages) - numberValue(a.missing_pages))[0]

  if (weakestTopic) {
    recommendations.push({
      type: "content_gap",
      priority: priorityFromScore(80 - numberValue(weakestTopic.coverage_score)),
      title: `Create supporting pages for ${weakestTopic.topic}`,
      description: `This topic appears across the scan but is missing on ${numberValue(weakestTopic.missing_pages)} sampled pages.`,
      action: `Publish or expand pages dedicated to ${weakestTopic.topic} and link them from high-authority pages.`,
    })
  }

  if (contentGapRows.length > 0) {
    const topGap = contentGapRows[0]
    recommendations.push({
      type: "competitor_gap",
      priority: priorityFromScore(numberValue(topGap.competitor_count) * 30),
      title: `Close competitor gap around ${topGap.topic || topGap.keyword}`,
      description: `${numberValue(topGap.competitor_count)} competitor domains cover ${topGap.keyword} while the target site does not.`,
      action: `Create or expand content for ${topGap.keyword} and connect it to existing pages with internal links and clear headings.`,
    })
  }

  const lowAiPages = pageRows
    .map((page) => ({
      page,
      aiScore: numberValue((page.ai_analysis || {}).ai_score),
      extracted: (page.extracted || {}) as Record<string, unknown>,
    }))
    .filter((item) => item.aiScore < 60)
    .sort((a, b) => a.aiScore - b.aiScore)

  if (lowAiPages.length > 0) {
    const weakest = lowAiPages[0]
    recommendations.push({
      type: "improve_headings",
      priority: "high",
      title: `Improve heading clarity on ${weakest.page.title || weakest.page.url}`,
      description: `This page has a low AI readiness score (${weakest.aiScore}) and needs clearer semantic structure and richer answer-first content.`,
      action: "Rewrite the H1/H2 structure so each section answers a focused search intent, then expand the copy with concise answers and supporting detail.",
    })
  }

  const pagesMissingSchema = pageRows.filter((page) => !Array.isArray(page.jsonld_types) || page.jsonld_types.length === 0)
  if (pagesMissingSchema.length > 0) {
    recommendations.push({
      type: "add_schema",
      priority: "high",
      title: "Add structured data to core pages",
      description: `${pagesMissingSchema.length} scanned pages have no detectable JSON-LD schema.`,
      action: "Add Organization, WebSite, FAQ, and Article schema where appropriate to improve machine-readable understanding.",
    })
  }

  const questionKeywords = keywordRows.filter((keyword) => keyword.keyword_type === "question")
  if (questionKeywords.length > 0) {
    recommendations.push({
      type: "answer_questions",
      priority: "medium",
      title: "Answer recurring audience questions directly",
      description: `${questionKeywords.length} question-style queries were extracted from the sampled content.`,
      action: "Create FAQ blocks or dedicated answer sections for the top recurring questions to improve AI answer eligibility.",
    })
  }

  const primaryKeywords = keywordRows.filter((keyword) => keyword.keyword_type === "primary")
  if (primaryKeywords.length > 0) {
    const topKeywords = primaryKeywords.slice(0, 3).map((keyword) => keyword.keyword)
    recommendations.push({
      type: "keyword_focus",
      priority: "medium",
      title: "Strengthen keyword focus on top commercial themes",
      description: `Top extracted themes include ${topKeywords.join(", ")}.`,
      action: "Align title tags, H1s, intros, and internal links around the strongest recurring keywords so search engines and AI systems see a clearer topic focus.",
    })
  }

  const weakInternalLinking = pageRows.filter((page) => numberValue((page.extracted || {}).internalLinksCount) < 3)
  if (weakInternalLinking.length > 0) {
    recommendations.push({
      type: "internal_links",
      priority: "medium",
      title: "Strengthen internal linking between related pages",
      description: `${weakInternalLinking.length} extracted pages have fewer than three internal links.`,
      action: "Add contextual internal links between service, FAQ, and topical pages to improve crawl depth and topic reinforcement.",
    })
  }

  const failedAiRules = ruleRows.filter((rule) => rule.status !== "pass" && rule.rule_key.startsWith("ai."))
  if (failedAiRules.length > 0) {
    recommendations.push({
      type: "ai_files",
      priority: "medium",
      title: "Improve AI crawler readiness assets",
      description: `${failedAiRules.length} AI-readiness rules are currently warning or failing.`,
      action: "Review llms.txt, /.well-known/ai.json, and brand metadata so AI systems can understand crawl and brand context.",
    })
  }

  if (competitorRows.length > 0) {
    recommendations.push({
      type: "competitor_monitoring",
      priority: "medium",
      title: "Track emerging competitor themes",
      description: `Competitor discovery identified ${competitorRows.length} external domains worth monitoring.`,
      action: `Review the strongest competitor pages and align your roadmap to outperform recurring themes in their content.`,
    })
  }

  const uniqueRecommendations = new Map<string, (typeof recommendations)[number]>()
  for (const recommendation of recommendations) {
    const key = `${scanId}:${recommendation.title.trim().toLowerCase()}`
    if (!uniqueRecommendations.has(key)) {
      uniqueRecommendations.set(key, recommendation)
    }
  }

  const { error: deleteError } = await supabase.from("auditor_recommendations").delete().eq("scan_id", scanId)
  if (deleteError) throw new Error(`generateRecommendations delete failed: ${deleteError.message}`)
  const rows = [...uniqueRecommendations.values()]
  if (rows.length === 0) return []

  const { error: insertError } = await supabase.from("auditor_recommendations").insert(
    rows.map((row) => ({
      scan_id: scanId,
      type: row.type,
      priority: row.priority,
      title: row.title,
      description: row.description,
      action: row.action,
    }))
  )
  if (insertError) throw new Error(`generateRecommendations insert failed: ${insertError.message}`)

  return rows
}
