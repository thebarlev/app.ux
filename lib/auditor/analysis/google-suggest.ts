// Google Suggest expansion — free keyword-discovery using the public
// suggestqueries.google.com endpoint that powers Google's autocomplete.
//
// Returns the queries Google's autocomplete would have offered a user typing
// the seed term. Useful as a complement to our in-house TF-IDF extraction:
// TF-IDF tells us what the *site* talks about, Suggest tells us what *people
// search for*. The gap between the two is exactly the keyword opportunity.
//
// No API key required. No payment. Rate-limited by Google IP-side (~1k/hour
// is generally safe). We cap calls to ~10 per scan to stay well under that.

const SUGGEST_ENDPOINT = "https://suggestqueries.google.com/complete/search"

export type GoogleSuggestEntry = {
  seed: string
  suggestions: string[]
}

export type GoogleSuggestResult = {
  ok: boolean
  fetched_at: string
  locale: string
  total_seeds: number
  total_suggestions: number
  unique_suggestions: number
  entries: GoogleSuggestEntry[]
  error?: string
}

async function fetchOneSuggest(seed: string, locale: string, timeoutMs: number): Promise<string[]> {
  const url = new URL(SUGGEST_ENDPOINT)
  url.searchParams.set("client", "firefox")
  url.searchParams.set("hl", locale)
  url.searchParams.set("q", seed)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const res = await fetch(url.toString(), {
      signal: ac.signal,
      headers: {
        accept: "application/json",
      },
    })
    if (!res.ok) return []
    const text = await res.text()
    // Suggest returns: ["seed",["suggestion1","suggestion2",...]]
    const parsed = JSON.parse(text) as [string, string[]]
    if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) return []
    return parsed[1]
      .map((s) => String(s || "").trim())
      .filter((s) => s.length > 0 && s.length < 120)
      .filter((s) => s.toLowerCase() !== seed.toLowerCase())
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function expandKeywordsWithSuggest(params: {
  seedKeywords: string[]
  locale?: string
  maxSeeds?: number
  timeoutMsPerSeed?: number
}): Promise<GoogleSuggestResult> {
  const locale = params.locale || "he"
  const maxSeeds = Math.max(1, Math.min(params.maxSeeds ?? 10, 20))
  const timeoutMs = params.timeoutMsPerSeed ?? 4000

  const seeds = (params.seedKeywords || [])
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 2 && s.length <= 80)
    // Dedupe while preserving order
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, maxSeeds)

  if (seeds.length === 0) {
    return {
      ok: true,
      fetched_at: new Date().toISOString(),
      locale,
      total_seeds: 0,
      total_suggestions: 0,
      unique_suggestions: 0,
      entries: [],
    }
  }

  // Fetch in parallel — Google handles concurrent requests fine for small batches.
  const results = await Promise.allSettled(
    seeds.map((seed) =>
      fetchOneSuggest(seed, locale, timeoutMs).then((suggestions) => ({ seed, suggestions }))
    )
  )

  const entries: GoogleSuggestEntry[] = []
  const allSuggestions = new Set<string>()
  let totalSuggestions = 0

  for (const r of results) {
    if (r.status !== "fulfilled") continue
    const { seed, suggestions } = r.value
    if (suggestions.length === 0) continue
    entries.push({ seed, suggestions })
    totalSuggestions += suggestions.length
    suggestions.forEach((s) => allSuggestions.add(s.toLowerCase()))
  }

  return {
    ok: true,
    fetched_at: new Date().toISOString(),
    locale,
    total_seeds: seeds.length,
    total_suggestions: totalSuggestions,
    unique_suggestions: allSuggestions.size,
    entries,
  }
}
