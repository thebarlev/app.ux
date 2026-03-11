import type { SupabaseClient } from "@supabase/supabase-js"

type SiteKeywordRow = {
  keyword: string
  keyword_type: string
}

type CompetitorKeywordRow = {
  keyword: string
  competitor_id: string
  confidence: number | null
}

function normalizeKeyword(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function topicFromKeyword(keyword: string): string | null {
  const parts = normalizeKeyword(keyword).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts.slice(0, Math.min(2, parts.length)).join(" ")
}

function priorityFromCount(count: number): "low" | "medium" | "high" {
  if (count >= 3) return "high"
  if (count >= 2) return "medium"
  return "low"
}

export async function analyzeContentGaps(params: {
  supabase: SupabaseClient
  scanId: string
}) {
  const { supabase, scanId } = params
  const [{ data: siteKeywords, error: siteKeywordsError }, { data: competitorKeywords, error: competitorKeywordsError }, { data: competitors, error: competitorsError }] = await Promise.all([
    supabase
      .from("auditor_keywords")
      .select("keyword,keyword_type")
      .eq("scan_id", scanId),
    supabase
      .from("auditor_competitor_keywords")
      .select("keyword,competitor_id,confidence")
      .eq("scan_id", scanId),
    supabase
      .from("auditor_competitors")
      .select("id,domain")
      .eq("scan_id", scanId),
  ])
  if (siteKeywordsError) throw new Error(`analyzeContentGaps site keywords query failed: ${siteKeywordsError.message}`)
  if (competitorKeywordsError) throw new Error(`analyzeContentGaps competitor keywords query failed: ${competitorKeywordsError.message}`)
  if (competitorsError) throw new Error(`analyzeContentGaps competitors query failed: ${competitorsError.message}`)

  const ownKeywords = new Set(
    ((siteKeywords || []) as SiteKeywordRow[])
      .map((row) => normalizeKeyword(row.keyword))
      .filter(Boolean)
  )
  const competitorDomains = new Map<string, string>(
    (competitors || []).map((row: any) => [String(row.id), String(row.domain)])
  )
  const gapMap = new Map<string, { competitors: Set<string>; domains: Set<string>; maxConfidence: number }>()

  for (const row of (competitorKeywords || []) as CompetitorKeywordRow[]) {
    const normalized = normalizeKeyword(row.keyword)
    if (!normalized || ownKeywords.has(normalized)) continue
    if (normalized.split(/\s+/).length < 2 && normalized.length < 8) continue

    const current = gapMap.get(normalized) || {
      competitors: new Set<string>(),
      domains: new Set<string>(),
      maxConfidence: 0,
    }
    current.competitors.add(row.competitor_id)
    const domain = competitorDomains.get(row.competitor_id)
    if (domain) current.domains.add(domain)
    current.maxConfidence = Math.max(current.maxConfidence, Number(row.confidence || 0))
    gapMap.set(normalized, current)
  }

  const gaps = [...gapMap.entries()]
    .map(([keyword, value]) => ({
      keyword,
      topic: topicFromKeyword(keyword),
      competitor_count: value.competitors.size,
      priority: priorityFromCount(value.competitors.size),
      evidence: {
        domains: [...value.domains].slice(0, 5),
        max_confidence: Number(value.maxConfidence.toFixed(2)),
      },
    }))
    .sort((a, b) => {
      if (b.competitor_count !== a.competitor_count) return b.competitor_count - a.competitor_count
      return Number((b.evidence as any).max_confidence || 0) - Number((a.evidence as any).max_confidence || 0)
    })
    .slice(0, 25)

  const { error: deleteError } = await supabase.from("auditor_content_gaps").delete().eq("scan_id", scanId)
  if (deleteError) throw new Error(`analyzeContentGaps delete failed: ${deleteError.message}`)
  if (gaps.length > 0) {
    const { error: insertError } = await supabase.from("auditor_content_gaps").insert(
      gaps.map((gap) => ({
        scan_id: scanId,
        keyword: gap.keyword,
        topic: gap.topic,
        priority: gap.priority,
        competitor_count: gap.competitor_count,
        evidence: gap.evidence,
      }))
    )
    if (insertError) throw new Error(`analyzeContentGaps insert failed: ${insertError.message}`)
  }

  return gaps
}
