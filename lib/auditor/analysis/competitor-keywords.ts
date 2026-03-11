import type { SupabaseClient } from "@supabase/supabase-js"
import { extractKeywords } from "./keywords"

type CompetitorPageRow = {
  id: string
  competitor_id: string
  title: string | null
  content: Record<string, unknown> | null
}

export async function extractCompetitorKeywords(params: {
  supabase: SupabaseClient
  scanId: string
}) {
  const { supabase, scanId } = params
  const { data: pages, error: pagesError } = await supabase
    .from("auditor_competitor_pages")
    .select("id,competitor_id,title,content")
    .eq("scan_id", scanId)
    .eq("state", "extracted")
  if (pagesError) throw new Error(`extractCompetitorKeywords pages query failed: ${pagesError.message}`)

  const pageRows = (pages || []) as CompetitorPageRow[]
  const { error: deleteError } = await supabase.from("auditor_competitor_keywords").delete().eq("scan_id", scanId)
  if (deleteError) throw new Error(`extractCompetitorKeywords delete failed: ${deleteError.message}`)

  let totalKeywords = 0
  for (const page of pageRows) {
    const content = page.content && typeof page.content === "object" ? page.content : {}
    const keywords = extractKeywords({
      title: typeof content.title === "string" ? content.title : page.title,
      headings: Array.isArray((content as any).headings) ? (content as any).headings : [],
      paragraphs: Array.isArray((content as any).paragraphs) ? (content as any).paragraphs : [],
      links: Array.isArray((content as any).links) ? (content as any).links : [],
      entities: Array.isArray((content as any).entities) ? (content as any).entities : [],
    })

    totalKeywords += keywords.length
    if (keywords.length === 0) continue

    const { error: insertError } = await supabase.from("auditor_competitor_keywords").insert(
      keywords.map((keyword) => ({
        scan_id: scanId,
        competitor_id: page.competitor_id,
        competitor_page_id: page.id,
        keyword: keyword.keyword,
        keyword_type: keyword.keyword_type,
        confidence: Number(keyword.confidence.toFixed(2)),
      }))
    )
    if (insertError) throw new Error(`extractCompetitorKeywords insert failed: ${insertError.message}`)
  }

  return { pagesCount: pageRows.length, keywordsCount: totalKeywords }
}
