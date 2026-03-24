import type { RelevanceEvaluation } from "@/lib/admin/index-extractor/types"

export const DEFAULT_RELEVANCE_THRESHOLD = 28

const POSITIVE_PATH_HINTS = ["contact", "about", "team", "staff", "services", "location", "support", "company"]
const NEGATIVE_PATH_HINTS = [
  "/search",
  "/tag",
  "/category",
  "/listing",
  "/author",
  "/page/",
  "/login",
  "/account",
  "/cart",
  "/checkout",
]
const NEGATIVE_TITLE_HINTS = ["top 10", "best of", "directory", "results", "list", "aggregator"]
const NEGATIVE_DOMAIN_HINTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "yelp.",
  "tripadvisor.",
  "wikipedia.org",
]
const BUSINESS_KEYWORDS = [
  "business",
  "company",
  "services",
  "clinic",
  "office",
  "agency",
  "חברה",
  "עסק",
  "שירות",
  "מרפאה",
]

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function countTokenHits(tokens: string[], text: string): number {
  if (tokens.length === 0) return 0
  const haystack = ` ${normalizeText(text)} `
  let hits = 0
  for (const token of new Set(tokens)) {
    if (haystack.includes(` ${token} `)) hits += 1
  }
  return hits
}

export function evaluateSearchCandidate(params: {
  query: string
  title: string
  snippet: string
  url: string
  rank: number | null
  threshold?: number
}): RelevanceEvaluation {
  const threshold = typeof params.threshold === "number" ? params.threshold : DEFAULT_RELEVANCE_THRESHOLD
  const reasons: string[] = []
  let score = 0

  const tokens = tokenize(params.query)
  const title = String(params.title || "")
  const snippet = String(params.snippet || "")
  const text = `${title} ${snippet}`

  const titleHits = countTokenHits(tokens, title)
  if (titleHits > 0) {
    score += Math.min(20, titleHits * 6)
    reasons.push(`title_token_hits:${titleHits}`)
  }

  const snippetHits = countTokenHits(tokens, snippet)
  if (snippetHits > 0) {
    score += Math.min(14, snippetHits * 4)
    reasons.push(`snippet_token_hits:${snippetHits}`)
  }

  const normalizedQuery = normalizeText(params.query)
  if (normalizedQuery && normalizeText(text).includes(normalizedQuery)) {
    score += 10
    reasons.push("exact_phrase_bonus")
  }

  const lowerText = normalizeText(text)
  if (BUSINESS_KEYWORDS.some((w) => lowerText.includes(w))) {
    score += 6
    reasons.push("business_keyword_bonus")
  }

  try {
    const url = new URL(params.url)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    if (!host.startsWith("www.") && host.split(".").length <= 3) {
      score += 4
      reasons.push("direct_business_domain_likelihood")
    }
    if (POSITIVE_PATH_HINTS.some((hint) => path.includes(hint))) {
      score += 4
      reasons.push("positive_path_hint")
    }
    if (NEGATIVE_PATH_HINTS.some((hint) => path.includes(hint))) {
      score -= 10
      reasons.push("negative_path_penalty")
    }
    if (NEGATIVE_DOMAIN_HINTS.some((hint) => host.includes(hint))) {
      score -= 16
      reasons.push("negative_domain_penalty")
    }
  } catch {
    score -= 8
    reasons.push("invalid_url_penalty")
  }

  if (NEGATIVE_TITLE_HINTS.some((hint) => lowerText.includes(hint))) {
    score -= 8
    reasons.push("negative_title_penalty")
  }

  if (typeof params.rank === "number") {
    if (params.rank <= 3) {
      score += 4
      reasons.push("high_rank_bonus")
    } else if (params.rank > 10) {
      score -= 4
      reasons.push("low_rank_penalty")
    }
  }

  const filteredOut = score < threshold
  return {
    relevance_score: score,
    relevance_reasons: reasons.slice(0, 10),
    filtered_out: filteredOut,
    filtered_out_reason: filteredOut ? "low_relevance_score" : undefined,
  }
}
