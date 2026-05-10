// Google PageSpeed Insights API integration.
//
// Free tier: 25,000 queries/day per API key (no payment required, just a free
// Google Cloud API key with the "PageSpeed Insights API" enabled).
//
// Returns Lighthouse-equivalent scores (Performance / Accessibility /
// Best Practices / SEO) plus real Core Web Vitals (LCP, CLS, INP, FCP, TBT).
// These are the same metrics Google itself uses to rank sites — significantly
// higher quality signal than our heuristic rules.
//
// Best-effort: if no API key is set, or PSI returns an error, we return null
// and the rest of the pipeline carries on without PSI data.

const PSI_ENDPOINT = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed"

export type PageSpeedStrategy = "mobile" | "desktop"

export type PageSpeedScores = {
  performance: number | null
  accessibility: number | null
  best_practices: number | null
  seo: number | null
}

export type CoreWebVitals = {
  lcp_ms: number | null
  cls: number | null
  inp_ms: number | null
  fcp_ms: number | null
  tbt_ms: number | null
}

export type PageSpeedResult = {
  url: string
  strategy: PageSpeedStrategy
  scores: PageSpeedScores
  cwv: CoreWebVitals
  loading_experience: "FAST" | "AVERAGE" | "SLOW" | null
  fetched_at: string
  // Free-form: raw audit IDs that failed, useful for the recommendations engine
  failed_audits: Array<{ id: string; title: string; score: number | null }>
}

function isPsiEnabled(): boolean {
  return Boolean(String(process.env.GOOGLE_PSI_API_KEY || "").trim())
}

function clampScore(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // PSI returns 0-1 floats; convert to 0-100 integer.
  return Math.round(Math.max(0, Math.min(1, n)) * 100)
}

function parseNumeric(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function fetchPageSpeed(params: {
  url: string
  strategy?: PageSpeedStrategy
  timeoutMs?: number
}): Promise<PageSpeedResult | null> {
  if (!isPsiEnabled()) return null

  const apiKey = String(process.env.GOOGLE_PSI_API_KEY || "").trim()
  const strategy: PageSpeedStrategy = params.strategy === "desktop" ? "desktop" : "mobile"
  const timeoutMs = params.timeoutMs ?? 30_000

  const queryUrl = new URL(PSI_ENDPOINT)
  queryUrl.searchParams.set("url", params.url)
  queryUrl.searchParams.set("strategy", strategy)
  queryUrl.searchParams.set("key", apiKey)
  // Request all 4 categories explicitly. PSI defaults to performance only.
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    queryUrl.searchParams.append("category", cat)
  }
  queryUrl.searchParams.set("locale", "he")

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const res = await fetch(queryUrl.toString(), { signal: ac.signal })
    if (!res.ok) {
      console.warn("[psi] non-2xx", { status: res.status, url: params.url })
      return null
    }
    const data = (await res.json()) as any

    const lighthouse = data?.lighthouseResult ?? {}
    const categories = lighthouse?.categories ?? {}
    const audits = lighthouse?.audits ?? {}

    const scores: PageSpeedScores = {
      performance: clampScore(categories.performance?.score),
      accessibility: clampScore(categories.accessibility?.score),
      best_practices: clampScore(categories["best-practices"]?.score),
      seo: clampScore(categories.seo?.score),
    }

    const cwv: CoreWebVitals = {
      lcp_ms: parseNumeric(audits["largest-contentful-paint"]?.numericValue),
      cls: parseNumeric(audits["cumulative-layout-shift"]?.numericValue),
      inp_ms: parseNumeric(audits["interaction-to-next-paint"]?.numericValue),
      fcp_ms: parseNumeric(audits["first-contentful-paint"]?.numericValue),
      tbt_ms: parseNumeric(audits["total-blocking-time"]?.numericValue),
    }

    const loadingExp = data?.loadingExperience?.overall_category
    const loading_experience: PageSpeedResult["loading_experience"] =
      loadingExp === "FAST" || loadingExp === "AVERAGE" || loadingExp === "SLOW"
        ? loadingExp
        : null

    // Pluck the 5 worst-failing audits — they double as recommendation seeds.
    const failedAudits: PageSpeedResult["failed_audits"] = []
    for (const [id, audit] of Object.entries(audits) as Array<[string, any]>) {
      if (typeof audit?.score === "number" && audit.score < 0.9 && audit.title) {
        failedAudits.push({
          id,
          title: String(audit.title),
          score: clampScore(audit.score),
        })
      }
    }
    failedAudits.sort((a, b) => (a.score ?? 100) - (b.score ?? 100))

    return {
      url: params.url,
      strategy,
      scores,
      cwv,
      loading_experience,
      fetched_at: new Date().toISOString(),
      failed_audits: failedAudits.slice(0, 5),
    }
  } catch (e: any) {
    console.warn("[psi] fetch failed", { url: params.url, message: String(e?.message || e) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Convenience: run mobile + desktop in parallel and return both. Saves time
// vs sequential calls (~30s vs ~60s for a typical site).
//
// Mobile-specific resilience: PSI's Lighthouse mobile run is heavier than
// desktop and frequently times out on JS-heavy sites or when Google's PSI
// servers are under load. We give mobile a longer initial timeout (45s vs
// desktop's 30s) and one retry. Desktop almost always succeeds first try.
export async function fetchPageSpeedBoth(url: string): Promise<{
  mobile: PageSpeedResult | null
  desktop: PageSpeedResult | null
}> {
  const fetchMobileWithRetry = async (): Promise<PageSpeedResult | null> => {
    let result = await fetchPageSpeed({ url, strategy: "mobile", timeoutMs: 45_000 })
    if (result) return result
    // One retry — PSI mobile failures are usually transient (timeout / load).
    result = await fetchPageSpeed({ url, strategy: "mobile", timeoutMs: 60_000 })
    return result
  }

  const [mobile, desktop] = await Promise.all([
    fetchMobileWithRetry(),
    fetchPageSpeed({ url, strategy: "desktop", timeoutMs: 30_000 }),
  ])
  return { mobile, desktop }
}
