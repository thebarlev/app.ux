type ExtractedShape = {
  h1Count?: number
  questionHeadingsCount?: number
  questionParagraphsCount?: number
  headingsOutline?: { h1?: number; h2?: number; h3?: number }
  hasFAQPage?: boolean
  hasArticle?: boolean
  contentEntities?: string[]
  wordCount?: number
}

export type AIAnalysisSignals = {
  structured_data: boolean
  faq: boolean
  ai_files: boolean
  semantic_headings: boolean
  content_depth: number
}

export type AIReadinessResult = {
  ai_score: number
  signals: AIAnalysisSignals
}

function numericValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function calculateAIScore(page: {
  title?: string | null
  jsonld_types?: string[] | null
  extracted?: ExtractedShape | null
  ai_files?: unknown
}): AIReadinessResult {
  const extracted = (page.extracted || {}) as ExtractedShape
  const entityCount = Array.isArray(extracted.contentEntities) ? extracted.contentEntities.length : 0
  const questionCount = numericValue(extracted.questionHeadingsCount) + numericValue(extracted.questionParagraphsCount)
  const wordCount = numericValue(extracted.wordCount)
  const headingOutline = extracted.headingsOutline || {}
  const faq = Boolean(extracted.hasFAQPage) || questionCount > 0
  const structuredData =
    faq ||
    Boolean(extracted.hasArticle) ||
    (Array.isArray(page.jsonld_types) && page.jsonld_types.length > 0)
  const aiFilesPack = page.ai_files && typeof page.ai_files === "object" ? (page.ai_files as Record<string, any>) : {}
  const aiFiles =
    Boolean(aiFilesPack.llms_txt?.found) ||
    Boolean(aiFilesPack.ai_json?.found) ||
    Boolean(aiFilesPack.brand_json?.found)

  const entityCoverage = clampPercent((entityCount / 5) * 100)
  const questionCoverage = clampPercent((questionCount / 3) * 100)
  const semanticHeadings =
    numericValue(extracted.h1Count) === 1 &&
    (numericValue(headingOutline.h2) > 0 || numericValue(headingOutline.h3) > 0) &&
    Boolean(page.title)
  const contentDepth = clampPercent((wordCount / 650) * 100)

  const score = clampPercent(
    entityCoverage * 0.2 +
      questionCoverage * 0.2 +
      (semanticHeadings ? 100 : 35) * 0.2 +
      (structuredData ? 100 : 30) * 0.15 +
      (aiFiles ? 100 : 30) * 0.1 +
      contentDepth * 0.25
  )

  return {
    ai_score: score,
    signals: {
      structured_data: structuredData,
      faq,
      ai_files: aiFiles,
      semantic_headings: semanticHeadings,
      content_depth: contentDepth,
    },
  }
}

export function summarizeAIReadiness(result: AIReadinessResult): {
  strengths: string[]
  gaps: string[]
} {
  const strengths: string[] = []
  const gaps: string[] = []

  if (result.signals.structured_data) strengths.push("Structured data is present for machine-readable context.")
  else gaps.push("Add Organization, WebSite, FAQ, or Article schema where relevant.")

  if (result.signals.faq) strengths.push("FAQ or question-answer content supports conversational AI retrieval.")
  else gaps.push("Add FAQ-style questions and concise answer sections.")

  if (result.signals.ai_files) strengths.push("AI crawler guidance files are available.")
  else gaps.push("Add llms.txt, ai.json, or brand metadata for AI crawlers.")

  if (result.signals.semantic_headings) strengths.push("Heading hierarchy is semantic and easy to parse.")
  else gaps.push("Improve heading hierarchy with a single H1 and descriptive H2/H3 sections.")

  if (result.signals.content_depth >= 60) strengths.push("Content depth is sufficient for richer answer generation.")
  else gaps.push("Expand the page with deeper explanatory paragraphs and examples.")

  return { strengths, gaps }
}
