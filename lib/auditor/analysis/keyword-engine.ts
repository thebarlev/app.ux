import type { SupabaseClient } from "@supabase/supabase-js"
import type { PageContent } from "./content-extract"
import { buildKeywordExtractionContext, extractKeywords, persistKeywords, type KeywordCandidate } from "./keywords"
import { discoverTopics } from "./topics"

type ExtractedPageRow = {
  id: string
  title: string | null
  extracted: Record<string, unknown> | null
}

type TopicSummary = {
  topic: string
  coverage_score: number
  missing_pages: number
}

type KeywordSummary = {
  keyword: string
  keyword_type: string
  confidence: number
  page_count: number
}

type KeywordCluster = {
  cluster: string
  top_keyword: string
  keyword_count: number
  page_count: number
  keywords: string[]
}

export type KeywordEngineResult = {
  keywords: KeywordSummary[]
  topics: TopicSummary[]
  clusters: KeywordCluster[]
  counts: {
    pages: number
    keywords: number
    topics: number
    clusters: number
  }
  skipped: boolean
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {}
}

function normalizeClusterKey(value: string): string | null {
  const tokens = String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)

  if (tokens.length === 0) return null
  const picked = tokens.slice(0, Math.min(3, tokens.length > 1 ? 2 : 3))
  return picked.join(" ")
}

function summarizeKeywords(rows: Array<{ pageId: string; candidate: KeywordCandidate }>): KeywordSummary[] {
  const grouped = new Map<string, { type: string; pageIds: Set<string>; confidence: number }>()

  for (const row of rows) {
    const keyword = String(row.candidate.keyword || "").trim()
    if (!keyword) continue
    const current = grouped.get(keyword) || {
      type: row.candidate.keyword_type,
      pageIds: new Set<string>(),
      confidence: 0,
    }
    current.pageIds.add(row.pageId)
    current.confidence = Math.max(current.confidence, Number(row.candidate.confidence || 0))
    grouped.set(keyword, current)
  }

  return [...grouped.entries()]
    .map(([keyword, value]) => ({
      keyword,
      keyword_type: value.type,
      confidence: Number(value.confidence.toFixed(2)),
      page_count: value.pageIds.size,
    }))
    .sort((a, b) => {
      if (b.page_count !== a.page_count) return b.page_count - a.page_count
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return a.keyword.localeCompare(b.keyword)
    })
    .slice(0, 25)
}

function buildClusters(rows: Array<{ pageId: string; candidate: KeywordCandidate }>): KeywordCluster[] {
  const grouped = new Map<string, { pageIds: Set<string>; keywords: Map<string, number> }>()

  for (const row of rows) {
    if (row.candidate.keyword_type === "question" || row.candidate.keyword_type === "entity") continue
    const clusterKey = normalizeClusterKey(row.candidate.keyword)
    if (!clusterKey) continue
    const current = grouped.get(clusterKey) || {
      pageIds: new Set<string>(),
      keywords: new Map<string, number>(),
    }
    current.pageIds.add(row.pageId)
    current.keywords.set(
      row.candidate.keyword,
      Math.max(current.keywords.get(row.candidate.keyword) || 0, Number(row.candidate.confidence || 0))
    )
    grouped.set(clusterKey, current)
  }

  return [...grouped.entries()]
    .map(([cluster, value]) => {
      const sortedKeywords = [...value.keywords.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0])
      })
      return {
        cluster,
        top_keyword: sortedKeywords[0]?.[0] || cluster,
        keyword_count: value.keywords.size,
        page_count: value.pageIds.size,
        keywords: sortedKeywords.slice(0, 8).map(([keyword]) => keyword),
      }
    })
    .sort((a, b) => {
      if (b.page_count !== a.page_count) return b.page_count - a.page_count
      if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count
      return a.cluster.localeCompare(b.cluster)
    })
    .slice(0, 15)
}

export async function runKeywordEngine(params: {
  supabase: SupabaseClient
  scanId: string
}) : Promise<KeywordEngineResult> {
  const { supabase, scanId } = params
  const [{ data: extractedPages }, { data: competitorKeywordRows }] = await Promise.all([
    supabase
      .from("auditor_scan_pages")
      .select("id,title,extracted")
      .eq("scan_id", scanId)
      .eq("state", "extracted")
      .limit(100),
    supabase
      .from("auditor_competitor_keywords")
      .select("keyword")
      .eq("scan_id", scanId),
  ])

  const pages = (Array.isArray(extractedPages) ? extractedPages : []) as ExtractedPageRow[]
  if (pages.length === 0) {
    await supabase.from("auditor_keywords").delete().eq("scan_id", scanId)
    await supabase.from("auditor_topics").delete().eq("scan_id", scanId)
    return {
      keywords: [],
      topics: [],
      clusters: [],
      counts: { pages: 0, keywords: 0, topics: 0, clusters: 0 },
      skipped: true,
    }
  }

  await supabase.from("auditor_keywords").delete().eq("scan_id", scanId)

  const pageContents = pages.map((page) => {
    const extracted = toRecord(page.extracted)
    return {
      id: String(page.id),
      content: {
        title: typeof extracted.contentTitle === "string" ? extracted.contentTitle : page.title || null,
        headings: Array.isArray(extracted.contentHeadings) ? extracted.contentHeadings : [],
        paragraphs: Array.isArray(extracted.contentParagraphs) ? extracted.contentParagraphs : [],
        links: Array.isArray(extracted.contentLinks) ? extracted.contentLinks : [],
        entities: Array.isArray(extracted.contentEntities) ? extracted.contentEntities : [],
      } satisfies PageContent,
    }
  })

  const context = buildKeywordExtractionContext({
    pages: pageContents.map((page) => page.content),
    competitorKeywords: (competitorKeywordRows || []).map((row: any) => String(row.keyword || "")),
  })

  const allKeywords: Array<{ pageId: string; candidate: KeywordCandidate }> = []
  let totalKeywords = 0

  for (const page of pageContents) {
    const keywords = extractKeywords(page.content, context)
    await persistKeywords({
      supabase,
      scanId,
      pageId: page.id,
      keywords,
    })
    totalKeywords += keywords.length
    for (const candidate of keywords) {
      allKeywords.push({ pageId: page.id, candidate })
    }
  }

  const topicsRaw = await discoverTopics({ supabase, scanId })
  const topics = (Array.isArray(topicsRaw) ? topicsRaw : []).map((topic: any) => ({
    topic: String(topic.topic || ""),
    coverage_score: Number(topic.coverage_score || 0),
    missing_pages: Number(topic.missing_pages || 0),
  }))
  const keywordSummary = summarizeKeywords(allKeywords)
  const clusters = buildClusters(allKeywords)

  return {
    keywords: keywordSummary,
    topics,
    clusters,
    counts: {
      pages: pageContents.length,
      keywords: totalKeywords,
      topics: topics.length,
      clusters: clusters.length,
    },
    skipped: false,
  }
}
