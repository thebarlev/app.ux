import type { SupabaseClient } from "@supabase/supabase-js"

type KeywordRow = {
  keyword: string
  keyword_type: string
  page_id: string
  confidence?: number | null
}

function normalizeTopicToken(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
}

function topicKey(keyword: string): string | null {
  const tokens = normalizeTopicToken(keyword)
  if (tokens.length === 0) return null
  const meaningful = tokens.filter((token) => token.length >= 4)
  const picked = (meaningful.length > 0 ? meaningful : tokens).slice(0, Math.min(3, Math.max(1, meaningful.length > 1 ? 2 : 3)))
  return picked.join(" ")
}

export async function discoverTopics(params: {
  supabase: SupabaseClient
  scanId: string
}) {
  const { supabase, scanId } = params

  const [{ data: keywords }, { data: pages }] = await Promise.all([
    supabase
      .from("auditor_keywords")
      .select("keyword,keyword_type,page_id,confidence")
      .eq("scan_id", scanId),
    supabase
      .from("auditor_scan_pages")
      .select("id")
      .eq("scan_id", scanId)
      .eq("state", "extracted"),
  ])

  const keywordRows = (keywords ?? []) as KeywordRow[]
  const totalPages = Math.max(1, (pages ?? []).length)
  const grouped = new Map<string, { pageIds: Set<string>; keywords: Set<string>; confidence: number }>()

  for (const row of keywordRows) {
    if (row.keyword_type === "question") continue
    const key = topicKey(row.keyword)
    if (!key) continue
    const current = grouped.get(key) || { pageIds: new Set<string>(), keywords: new Set<string>(), confidence: 0 }
    current.pageIds.add(row.page_id)
    current.keywords.add(row.keyword)
    current.confidence += Number(row.confidence || 0)
    grouped.set(key, current)
  }

  const topics = [...grouped.entries()]
    .map(([topic, value]) => ({
      topic,
      coverage_score: Number(Math.min(100, (value.pageIds.size / totalPages) * 70 + Math.min(30, value.confidence * 10)).toFixed(2)),
      missing_pages: Math.max(0, totalPages - value.pageIds.size),
      keyword_count: value.keywords.size,
      confidence: value.confidence,
    }))
    .sort((a, b) => {
      if (b.coverage_score !== a.coverage_score) return b.coverage_score - a.coverage_score
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return b.keyword_count - a.keyword_count
    })
    .slice(0, 15)

  await supabase.from("auditor_topics").delete().eq("scan_id", scanId)
  if (topics.length === 0) return []

  const rows = topics.map(({ topic, coverage_score, missing_pages }) => ({
    scan_id: scanId,
    topic,
    coverage_score,
    missing_pages,
  }))

  await supabase.from("auditor_topics").insert(rows)
  return topics
}
