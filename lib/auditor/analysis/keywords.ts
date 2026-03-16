import type { SupabaseClient } from "@supabase/supabase-js"
import type { PageContent } from "./content-extract"

export type KeywordType = "primary" | "secondary" | "question" | "entity"
export type KeywordSourceType = "title" | "h1" | "h2" | "internal_anchor" | "paragraph" | "faq_question"

export type KeywordCandidate = {
  keyword: string
  keyword_type: KeywordType
  confidence: number
  metadata?: {
    score: number
    source_types: KeywordSourceType[]
    is_question: boolean
  }
}

export type KeywordExtractionContext = {
  repeatedPhraseCounts: Map<string, number>
  competitorKeywords: Set<string>
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

const ALLOWED_SHORT_TOKENS = new Set(["ai", "seo", "ux", "ui", "faq", "ga4", "ppc", "saas", "crm", "erp", "vs"])

const QUESTION_PREFIXES = [
  "what",
  "how",
  "why",
  "when",
  "where",
  "which",
  "who",
  "can",
  "does",
  "is",
  "should",
  "מה",
  "איך",
  "למה",
  "מתי",
  "איפה",
  "איזה",
  "איזו",
  "מי",
  "האם",
]

const SERVICE_MODIFIERS = [
  "service",
  "services",
  "company",
  "agency",
  "consultant",
  "consultants",
  "expert",
  "experts",
  "solution",
  "solutions",
  "שירות",
  "שירותים",
  "חברה",
  "סוכנות",
  "יועץ",
  "יועצים",
  "מומחה",
  "מומחים",
  "פתרון",
  "פתרונות",
]

const COMMERCIAL_MODIFIERS = [
  "pricing",
  "price",
  "prices",
  "cost",
  "best",
  "top",
  "vs",
  "compare",
  "comparison",
  "affordable",
  "מחיר",
  "מחירים",
  "עלות",
  "השוואה",
  "לעומת",
  "הכי",
  "מומלץ",
]

const LOCATION_MODIFIERS = [
  "near me",
  "israel",
  "usa",
  "uk",
  "united states",
  "united kingdom",
  "canada",
  "australia",
  "germany",
  "france",
  "spain",
  "italy",
  "london",
  "new york",
  "los angeles",
  "tel aviv",
  "jerusalem",
  "haifa",
  "ישראל",
  "תל אביב",
  "תל-אביב",
  "ירושלים",
  "חיפה",
  "באר שבע",
  "קרוב אלי",
]

type KeywordSignal = {
  keyword: string
  score: number
  sourceTypes: Set<KeywordSourceType>
  isQuestion: boolean
}

function singularizeToken(token: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(token)) return token
  if (ALLOWED_SHORT_TOKENS.has(token)) return token
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`
  if (/(xes|zes|ches|shes|sses)$/.test(token) && token.length > 5) return token.slice(0, -2)
  if (token.endsWith("s") && token.length > 4 && !/(ss|us|is)$/.test(token)) return token.slice(0, -1)
  return token
}

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => singularizeToken(token.trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeKeyword(value)
    .split(/\s+/)
    .filter((token) => {
      if (!token || STOP_WORDS.has(token)) return false
      if (ALLOWED_SHORT_TOKENS.has(token)) return true
      return token.length >= 3
    })
}

function phraseCandidates(
  value: string,
  options: {
    minWords?: number
    maxWords?: number
  } = {}
): string[] {
  const tokens = tokenize(value)
  const out: string[] = []
  const minWords = Math.max(1, options.minWords ?? 1)
  const maxWords = Math.max(minWords, Math.min(options.maxWords ?? 4, tokens.length))
  for (let size = minWords; size <= maxWords; size += 1) {
    for (let start = 0; start <= tokens.length - size; start += 1) {
      const phrase = tokens.slice(start, start + size).join(" ")
      if (phrase.length < 3) continue
      if (size === 1 && !ALLOWED_SHORT_TOKENS.has(phrase) && phrase.length < 4) continue
      out.push(phrase)
    }
  }
  return Array.from(new Set(out))
}

function isQuestionText(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normalized) return false
  if (normalized.endsWith("?")) return true
  return QUESTION_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `))
}

function keywordModifierBonus(keyword: string): number {
  const normalized = normalizeKeyword(keyword)
  if (!normalized) return 0
  let bonus = 0
  if (SERVICE_MODIFIERS.some((modifier) => normalized.includes(normalizeKeyword(modifier)))) bonus += 1
  if (COMMERCIAL_MODIFIERS.some((modifier) => normalized.includes(normalizeKeyword(modifier)))) bonus += 1
  if (LOCATION_MODIFIERS.some((modifier) => normalized.includes(normalizeKeyword(modifier)))) bonus += 1
  return bonus
}

function questionCandidates(content: PageContent): KeywordSignal[] {
  const out: KeywordSignal[] = []
  const prompts = [...content.headings.map((item) => item.text), ...content.paragraphs]
  for (const prompt of prompts) {
    const normalized = prompt.replace(/\s+/g, " ").trim()
    if (!isQuestionText(normalized)) continue
    const sourceType: KeywordSourceType = normalized.endsWith("?") ? "faq_question" : "faq_question"
    const directCandidate = normalizeKeyword(normalized.replace(/\?+/g, " ").slice(0, 140))
    if (directCandidate.length >= 8) {
      out.push({
        keyword: directCandidate,
        score: 4,
        sourceTypes: new Set<KeywordSourceType>([sourceType]),
        isQuestion: true,
      })
    }
    for (const phrase of phraseCandidates(normalized, { minWords: 2, maxWords: 4 })) {
      out.push({
        keyword: phrase,
        score: 4,
        sourceTypes: new Set<KeywordSourceType>([sourceType]),
        isQuestion: true,
      })
    }
  }
  return out
}

export function buildKeywordExtractionContext(params: {
  pages: PageContent[]
  competitorKeywords?: Iterable<string>
}): KeywordExtractionContext {
  const repeatedPhraseCounts = new Map<string, number>()
  for (const page of params.pages) {
    const pagePhrases = new Set<string>()
    for (const paragraph of page.paragraphs) {
      for (const phrase of phraseCandidates(paragraph, { minWords: 2, maxWords: 4 })) {
        pagePhrases.add(phrase)
      }
    }
    for (const phrase of pagePhrases) {
      repeatedPhraseCounts.set(phrase, (repeatedPhraseCounts.get(phrase) || 0) + 1)
    }
  }

  const competitorKeywords = new Set<string>()
  for (const keyword of params.competitorKeywords || []) {
    const normalized = normalizeKeyword(String(keyword || ""))
    if (normalized) competitorKeywords.add(normalized)
  }

  return { repeatedPhraseCounts, competitorKeywords }
}

export function extractKeywords(content: PageContent, context?: KeywordExtractionContext): KeywordCandidate[] {
  const signals = new Map<string, KeywordSignal>()

  const registerSignal = (keyword: string, sourceType: KeywordSourceType, score: number, isQuestion = false) => {
    const normalized = normalizeKeyword(keyword)
    if (!normalized || normalized.length < 3) return
    if (!normalized.includes(" ") && !ALLOWED_SHORT_TOKENS.has(normalized) && normalized.length < 4) return
    const existing = signals.get(normalized) || {
      keyword: normalized,
      score: 0,
      sourceTypes: new Set<KeywordSourceType>(),
      isQuestion: false,
    }
    existing.score += score
    existing.sourceTypes.add(sourceType)
    existing.isQuestion = existing.isQuestion || isQuestion
    signals.set(normalized, existing)
  }

  const registerPhrases = (value: string, sourceType: KeywordSourceType, score: number, options?: { minWords?: number }) => {
    for (const phrase of phraseCandidates(value, { minWords: options?.minWords ?? 1, maxWords: 4 })) {
      registerSignal(phrase, sourceType, score)
    }
  }

  if (content.title) {
    registerPhrases(content.title, "title", 5)
  }
  for (const heading of content.headings) {
    if (heading.level === 1) {
      registerPhrases(heading.text, "h1", 4)
    } else if (heading.level === 2) {
      registerPhrases(heading.text, "h2", 3)
    }
  }
  for (const paragraph of content.paragraphs) {
    registerPhrases(paragraph, "paragraph", 1, { minWords: 2 })
  }
  for (const link of content.links) {
    if (link.isInternal) registerPhrases(link.text, "internal_anchor", 2)
  }

  for (const signal of questionCandidates(content)) {
    registerSignal(signal.keyword, "faq_question", signal.score, true)
  }

  const ranked = [...signals.values()]
    .map((signal) => {
      let totalScore = signal.score
      if ((context?.repeatedPhraseCounts.get(signal.keyword) || 0) > 1) totalScore += 3
      if (context?.competitorKeywords?.has(signal.keyword)) totalScore += 2
      totalScore += keywordModifierBonus(signal.keyword)
      totalScore += Math.min(2, Math.max(0, signal.keyword.split(/\s+/).length - 1))
      return {
        ...signal,
        score: totalScore,
      }
    })
    .filter((signal) => {
      if (signal.isQuestion) return signal.score >= 4
      if (signal.keyword.includes(" ")) return signal.score >= 3
      return signal.score >= 6
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const wordDelta = b.keyword.split(/\s+/).length - a.keyword.split(/\s+/).length
      if (wordDelta !== 0) return wordDelta
      return a.keyword.localeCompare(b.keyword)
    })
    .slice(0, 24)

  const keywordSignals = ranked.filter((signal) => !signal.isQuestion)
  const multiWord = keywordSignals.filter((signal) => signal.keyword.includes(" "))
  const singleWord = keywordSignals.filter((signal) => !signal.keyword.includes(" "))
  const primary = [...multiWord.slice(0, 4), ...singleWord.slice(0, 2)].slice(0, 6).map((signal, index) => ({
    keyword: signal.keyword,
    keyword_type: (index < 3 ? "primary" : "secondary") as KeywordType,
    confidence: Math.min(0.98, 0.5 + signal.score / 18),
    metadata: {
      score: signal.score,
      source_types: [...signal.sourceTypes],
      is_question: false,
    },
  }))
  const secondary = [...multiWord.slice(4), ...singleWord.slice(2, 8)].slice(0, 6).map((signal) => ({
    keyword: signal.keyword,
    keyword_type: "secondary" as KeywordType,
    confidence: Math.min(0.92, 0.42 + signal.score / 20),
    metadata: {
      score: signal.score,
      source_types: [...signal.sourceTypes],
      is_question: false,
    },
  }))

  const questions = ranked
    .filter((signal) => signal.isQuestion)
    .slice(0, 8)
    .map((signal) => ({
      keyword: signal.keyword,
      keyword_type: "question" as KeywordType,
      confidence: Math.min(0.95, 0.52 + signal.score / 18),
      metadata: {
        score: signal.score,
        source_types: [...signal.sourceTypes],
        is_question: true,
      },
    }))

  const entities = content.entities.slice(0, 8).map((keyword, index) => ({
    keyword: normalizeKeyword(keyword),
    keyword_type: "entity" as KeywordType,
    confidence: Math.max(0.45, 0.9 - index * 0.05),
    metadata: {
      score: Math.max(1, 8 - index),
      source_types: ["paragraph"] as KeywordSourceType[],
      is_question: false,
    },
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
