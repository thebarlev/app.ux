import { canonicalizeUrl } from "@/lib/admin/index-extractor/url-safety"
import { evaluateSearchCandidate } from "@/lib/admin/index-extractor/relevance"
import type { SearchCandidateDiagnostic, SearchDiagnostics, SourceInput } from "@/lib/admin/index-extractor/types"

type SearchDiscoveryResult = {
  sources: SourceInput[]
  diagnostics: SearchDiagnostics
}

type SerpHit = {
  link: string
  title: string
  snippet: string
  rank: number | null
  engine: "google_cse" | "serper"
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const v = Number(value)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function normalizeSearchUrl(raw: string): string | null {
  try {
    const url = new URL(String(raw || "").trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    return canonicalizeUrl(url)
  } catch {
    return null
  }
}

function toSourceInput(params: {
  hit: SerpHit
  query: string
  crawlLimitPerSource?: number
}): SourceInput | null {
  const normalized = normalizeSearchUrl(params.hit.link)
  if (!normalized) return null
  return {
    sourceUrl: normalized,
    crawlLimitPerSource: params.crawlLimitPerSource,
    sourceMeta: {
      search_source: "google_query",
      search_engine: params.hit.engine,
      search_query: params.query,
      search_rank: params.hit.rank,
      search_title: params.hit.title || "",
      search_snippet: params.hit.snippet || "",
    },
  }
}

function dedupeSources(sources: SourceInput[]): SourceInput[] {
  const out: SourceInput[] = []
  const seenUrls = new Set<string>()
  const seenDomains = new Set<string>()
  for (const source of sources) {
    const urlKey = String(source.sourceUrl || "").toLowerCase()
    if (!urlKey || seenUrls.has(urlKey)) continue
    let domain = ""
    try {
      domain = new URL(urlKey).hostname.toLowerCase()
    } catch {
      continue
    }
    domain = domain.replace(/^www\./, "")
    if (!domain || seenDomains.has(domain)) continue
    seenUrls.add(urlKey)
    seenDomains.add(domain)
    out.push(source)
  }
  return out
}

async function fetchGoogleCse(params: {
  query: string
  limit: number
  country?: string
  language?: string
}): Promise<{ hits: SerpHit[]; error?: string }> {
  const apiKey = String(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || "").trim()
  const cx = String(process.env.GOOGLE_CUSTOM_SEARCH_CX || "").trim()
  if (!apiKey || !cx) {
    return { hits: [], error: "google_cse_not_configured" }
  }
  const limit = boundedInt(params.limit, 10, 1, 10)
  const timeoutMs = boundedInt(Number(process.env.GOOGLE_CUSTOM_SEARCH_TIMEOUT_MS || 6000), 6000, 2000, 15000)

  const searchParams = new URLSearchParams({
    key: apiKey,
    cx,
    q: params.query,
    num: String(limit),
  })
  if (params.country) searchParams.set("gl", params.country)
  if (params.language) searchParams.set("lr", `lang_${params.language}`)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`, {
      method: "GET",
      signal: ac.signal,
      headers: { accept: "application/json" },
    })
    if (!res.ok) return { hits: [], error: `google_cse_status_${res.status}` }
    const payload = (await res.json()) as { items?: Array<{ link?: string; title?: string; snippet?: string }> }
    const hits: SerpHit[] = []
    for (const [idx, item] of (payload.items || []).entries()) {
      const link = String(item.link || "").trim()
      if (!link) continue
      hits.push({
        link,
        title: String(item.title || "").trim(),
        snippet: String(item.snippet || "").trim(),
        rank: idx + 1,
        engine: "google_cse",
      })
    }
    return { hits }
  } catch (e: unknown) {
    const isAbort = e instanceof Error && e.name === "AbortError"
    return { hits: [], error: isAbort ? "google_cse_timeout" : `google_cse_error:${String(e instanceof Error ? e.message : e)}` }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSerper(params: {
  query: string
  limit: number
  country?: string
  language?: string
}): Promise<{ hits: SerpHit[]; error?: string }> {
  const apiKey = String(process.env.AUDITOR_SERPER_API_KEY || "").trim()
  if (!apiKey) return { hits: [], error: "serper_not_configured" }
  const endpoint = String(process.env.AUDITOR_SERPER_ENDPOINT || "https://google.serper.dev/search").trim()
  const limit = boundedInt(params.limit, 10, 1, 20)
  const timeoutMs = boundedInt(Number(process.env.AUDITOR_SERPER_TIMEOUT_MS || 6000), 6000, 2000, 15000)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        q: params.query,
        num: limit,
        gl: params.country || undefined,
        hl: params.language || undefined,
      }),
    })
    if (!res.ok) return { hits: [], error: `serper_status_${res.status}` }
    const payload = (await res.json()) as { organic?: Array<{ link?: string; title?: string; snippet?: string; position?: number }> }
    const hits: SerpHit[] = []
    for (const item of payload.organic || []) {
      const link = String(item.link || "").trim()
      if (!link) continue
      hits.push({
        link,
        title: String(item.title || "").trim(),
        snippet: String(item.snippet || "").trim(),
        rank: typeof item.position === "number" ? item.position : null,
        engine: "serper",
      })
    }
    return { hits }
  } catch (e: unknown) {
    const isAbort = e instanceof Error && e.name === "AbortError"
    return { hits: [], error: isAbort ? "serper_timeout" : `serper_error:${String(e instanceof Error ? e.message : e)}` }
  } finally {
    clearTimeout(timer)
  }
}

export async function discoverSourcesFromGoogleQuery(params: {
  query: string
  limit?: number
  country?: string
  language?: string
  crawlLimitPerSource?: number
}): Promise<SearchDiscoveryResult> {
  const startedAt = Date.now()
  const query = String(params.query || "").trim()
  const limit = boundedInt(params.limit, 10, 1, 20)
  const diagnostics: SearchDiagnostics = {
    mode: "google_search",
    query,
    engine_requested: "google_cse",
    engine_used: "none",
    candidate_count_raw: 0,
    candidate_count_normalized: 0,
    candidate_count_deduped: 0,
    candidate_count_filtered_in: 0,
    candidate_count_filtered_out: 0,
    crawl_seed_count: 0,
    candidate_count: 0,
    deduped_count: 0,
    fallback_used: false,
    warnings: [],
    errors: [],
    candidates: [],
    timings: {},
  }
  if (!query) {
    diagnostics.errors?.push("missing_query")
    diagnostics.timings = { total_ms: Date.now() - startedAt }
    return { sources: [], diagnostics }
  }

  const searchStartedAt = Date.now()
  const primary = await fetchGoogleCse({
    query,
    limit,
    country: params.country,
    language: params.language,
  })
  let hits = primary.hits
  if (primary.error) diagnostics.errors?.push(primary.error)
  if (hits.length === 0) {
    const fallback = await fetchSerper({
      query,
      limit,
      country: params.country,
      language: params.language,
    })
    diagnostics.fallback_used = true
    if (fallback.error) diagnostics.errors?.push(fallback.error)
    hits = fallback.hits
  }
  diagnostics.timings = {
    ...(diagnostics.timings || {}),
    search_ms: Date.now() - searchStartedAt,
  }

  diagnostics.engine_used = hits[0]?.engine || "none"
  diagnostics.candidate_count_raw = hits.length
  diagnostics.candidate_count = hits.length

  const mapped = hits
    .map((hit) =>
      toSourceInput({
        hit,
        query,
        crawlLimitPerSource: params.crawlLimitPerSource,
      })
    )
    .filter((value): value is SourceInput => Boolean(value))
  diagnostics.candidate_count_normalized = mapped.length

  const deduped = dedupeSources(mapped).slice(0, limit)
  diagnostics.candidate_count_deduped = deduped.length
  diagnostics.deduped_count = deduped.length

  const sourceByUrl = new Map(deduped.map((item) => [item.sourceUrl, item]))
  const candidateDiagnostics: SearchCandidateDiagnostic[] = deduped.map((source) => {
    const meta = source.sourceMeta || {}
    const evaluation = evaluateSearchCandidate({
      query,
      title: String(meta.search_title || ""),
      snippet: String(meta.search_snippet || ""),
      url: source.sourceUrl,
      rank: typeof meta.search_rank === "number" ? meta.search_rank : null,
    })
    return {
      url: source.sourceUrl,
      domain: new URL(source.sourceUrl).hostname.toLowerCase(),
      rank: typeof meta.search_rank === "number" ? meta.search_rank : null,
      search_engine: (meta.search_engine || "google_cse") as "google_cse" | "serper",
      search_source: "google_query",
      title: String(meta.search_title || ""),
      snippet: String(meta.search_snippet || ""),
      relevance_score: evaluation.relevance_score,
      relevance_reasons: evaluation.relevance_reasons,
      filtered_out: evaluation.filtered_out,
      filtered_out_reason: evaluation.filtered_out_reason,
    }
  })

  const filteredIn = candidateDiagnostics.filter((c) => !c.filtered_out)
  diagnostics.candidate_count_filtered_in = filteredIn.length
  diagnostics.candidate_count_filtered_out = candidateDiagnostics.length - filteredIn.length
  diagnostics.crawl_seed_count = filteredIn.length
  diagnostics.candidates = candidateDiagnostics
  if (diagnostics.candidate_count_filtered_out > 0) {
    diagnostics.warnings?.push(`filtered_out:${diagnostics.candidate_count_filtered_out}`)
  }
  diagnostics.timings = {
    ...(diagnostics.timings || {}),
    filter_ms: Date.now() - searchStartedAt - Number(diagnostics.timings?.search_ms || 0),
    total_ms: Date.now() - startedAt,
  }
  if (filteredIn.length === 0 && candidateDiagnostics.length > 0) {
    diagnostics.warnings?.push("all_candidates_filtered_out")
  }

  const filteredSources = filteredIn
    .map((candidate) => sourceByUrl.get(candidate.url))
    .filter((value): value is SourceInput => Boolean(value))

  // If heuristics filtered everything out, keep a small best-effort slice
  // so the run can still proceed instead of hard-failing with zero seeds.
  if (filteredSources.length === 0 && candidateDiagnostics.length > 0) {
    diagnostics.warnings?.push("fallback_kept_top_candidates")
    const fallbackCandidates = [...candidateDiagnostics]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, Math.min(5, limit))
    const fallbackSources = fallbackCandidates
      .map((candidate) => sourceByUrl.get(candidate.url))
      .filter((value): value is SourceInput => Boolean(value))
    if (fallbackSources.length > 0) {
      diagnostics.candidate_count_filtered_in = fallbackSources.length
      diagnostics.candidate_count_filtered_out = Math.max(0, candidateDiagnostics.length - fallbackSources.length)
      diagnostics.crawl_seed_count = fallbackSources.length
      return { sources: fallbackSources, diagnostics }
    }
  }

  return { sources: filteredSources, diagnostics }
}
