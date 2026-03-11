import type { SupabaseClient } from "@supabase/supabase-js"
import type { PageContent } from "./content-extract"

export type KeywordType = "primary" | "secondary" | "question" | "entity"

export type KeywordCandidate = {
  keyword: string
  keyword_type: KeywordType
  confidence: number
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "אבל",
  "are",
  "be",
  "האם",
  "הוא",
  "היא",
  "הם",
  "הן",
  "זה",
  "זו",
  "איך",
  "אין",
  "אני",
  "אנחנו",
  "אם",
  "about",
  "after",
  "also",
  "are",
  "as",
  "at",
  "but",
  "because",
  "been",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "how",
  "in",
  "into",
  "is",
  "just",
  "more",
  "most",
  "of",
  "only",
  "on",
  "or",
  "other",
  "over",
  "such",
  "than",
  "that",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "to",
  "the",
  "what",
  "why",
  "when",
  "where",
  "which",
  "while",
  "with",
  "your",
  "את",
  "אתם",
  "אתן",
  "גם",
  "כך",
  "כל",
  "לא",
  "מה",
  "מי",
  "מן",
  "על",
  "של",
  "עם",
])

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeKeyword(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function phraseCandidates(value: string): string[] {
  const tokens = tokenize(value)
  const out: string[] = []
  for (let size = 1; size <= Math.min(3, tokens.length); size += 1) {
    for (let start = 0; start <= tokens.length - size; start += 1) {
      const phrase = tokens.slice(start, start + size).join(" ")
      if (phrase.length < 3) continue
      out.push(phrase)
    }
  }
  return Array.from(new Set(out))
}

function questionCandidates(content: PageContent): KeywordCandidate[] {
  const out: KeywordCandidate[] = []
  const prompts = [...content.headings.map((item) => item.text), ...content.paragraphs]
  for (const prompt of prompts) {
    const normalized = prompt.replace(/\s+/g, " ").trim()
    if (!normalized.includes("?")) continue
    const candidate = normalized.replace(/\?+/g, "?").slice(0, 140)
    if (candidate.length < 10) continue
    out.push({ keyword: candidate, keyword_type: "question", confidence: 0.8 })
  }
  return out
}

export function extractKeywords(content: PageContent): KeywordCandidate[] {
  const weighted = new Map<string, number>()
  const addWeight = (keyword: string, weight: number) => {
    const normalized = normalizeKeyword(keyword)
    if (!normalized || normalized.length < 3) return
    weighted.set(normalized, (weighted.get(normalized) || 0) + weight)
  }

  const addWeightedTerms = (value: string, weight: number) => {
    for (const phrase of phraseCandidates(value)) addWeight(phrase, weight)
  }

  if (content.title) {
    addWeight(content.title, 7)
    addWeightedTerms(content.title, 5)
  }
  for (const heading of content.headings) {
    addWeight(heading.text, heading.level === 1 ? 6 : heading.level === 2 ? 4 : 2)
    addWeightedTerms(heading.text, heading.level === 1 ? 4 : 2)
  }
  for (const paragraph of content.paragraphs) {
    addWeightedTerms(paragraph, 1)
  }
  for (const link of content.links) {
    if (link.isInternal) addWeightedTerms(link.text, 0.5)
  }

  const ranked = [...weighted.entries()]
    .filter(([keyword, score]) => score > 1 && keyword.length >= 4)
    .sort((a, b) => {
      const aWords = a[0].split(/\s+/).length
      const bWords = b[0].split(/\s+/).length
      const aScore = a[1] + Math.min(2, (aWords - 1) * 0.75)
      const bScore = b[1] + Math.min(2, (bWords - 1) * 0.75)
      return bScore - aScore
    })
    .slice(0, 24)

  const multiWord = ranked.filter(([keyword]) => keyword.includes(" "))
  const singleWord = ranked.filter(([keyword]) => !keyword.includes(" "))
  const primary = [...multiWord.slice(0, 4), ...singleWord.slice(0, 2)].slice(0, 6).map(([keyword, score], index) => ({
    keyword,
    keyword_type: (index < 3 ? "primary" : "secondary") as KeywordType,
    confidence: Math.min(0.98, 0.55 + score / 20),
  }))
  const secondary = [...multiWord.slice(4), ...singleWord.slice(2, 8)].slice(0, 6).map(([keyword, score]) => ({
    keyword,
    keyword_type: "secondary" as KeywordType,
    confidence: Math.min(0.92, 0.45 + score / 22),
  }))

  const questions = questionCandidates(content)
  const entities = content.entities.slice(0, 8).map((keyword, index) => ({
    keyword: normalizeKeyword(keyword),
    keyword_type: "entity" as KeywordType,
    confidence: Math.max(0.45, 0.9 - index * 0.05),
  }))

  const deduped = new Map<string, KeywordCandidate>()
  for (const candidate of [...primary, ...secondary, ...questions, ...entities]) {
    const key = `${candidate.keyword_type}:${normalizeKeyword(candidate.keyword)}`
    if (!deduped.has(key)) deduped.set(key, candidate)
  }

  return [...deduped.values()]
}

export async function persistKeywords(params: {
  supabase: SupabaseClient
  scanId: string
  pageId: string
  keywords: KeywordCandidate[]
}) {
  const { supabase, scanId, pageId, keywords } = params
  await supabase.from("auditor_keywords").delete().eq("page_id", pageId)
  if (keywords.length === 0) return

  const rows = keywords.map((keyword) => ({
    scan_id: scanId,
    page_id: pageId,
    keyword: normalizeKeyword(keyword.keyword),
    keyword_type: keyword.keyword_type,
    confidence: Number(keyword.confidence.toFixed(2)),
  }))

  await supabase.from("auditor_keywords").insert(rows)
}
