import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeInputUrl, resolveAndValidateHost } from "../ssrf"

type ExternalLink = {
  href: string
  text: string
}

type DiscoveredCompetitor = {
  domain: string
  source: "serp" | "heuristic"
  confidence: number
  rank: number | null
  metadata: Record<string, unknown>
}

const IGNORED_DOMAINS = new Set([
  "facebook.com",
  "github.com",
  "instagram.com",
  "linkedin.com",
  "medium.com",
  "npmjs.com",
  "reddit.com",
  "t.co",
  "threads.net",
  "twitter.com",
  "x.com",
  "youtube.com",
])

function normalizeDomain(hostname: string): string {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
}

function apexDomain(hostname: string): string {
  const normalized = normalizeDomain(hostname)
  const parts = normalized.split(".").filter(Boolean)
  if (parts.length <= 2) return normalized
  return parts.slice(-2).join(".")
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function isCompetitorCandidate(hostname: string, targetHost: string): boolean {
  const domain = normalizeDomain(hostname)
  if (!domain) return false
  if (IGNORED_DOMAINS.has(domain)) return false
  if (domain === normalizeDomain(targetHost)) return false
  if (apexDomain(domain) === apexDomain(targetHost)) return false
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) return false
  return true
}

async function discoverViaSerp(params: {
  targetHost: string
  seedKeywords: string[]
}): Promise<DiscoveredCompetitor[]> {
  const apiKey = String(process.env.AUDITOR_SERPER_API_KEY || "").trim()
  if (!apiKey) return []

  const endpoint = String(process.env.AUDITOR_SERPER_ENDPOINT || "https://google.serper.dev/search").trim()
  const query = `${params.seedKeywords.slice(0, 3).join(" ")} alternatives competitors`
  if (!query.trim()) return []

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: 10,
      }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { organic?: Array<{ link?: string; position?: number; title?: string }> }
    const out: DiscoveredCompetitor[] = []
    for (const result of json.organic || []) {
      const url = safeUrl(String(result.link || ""))
      if (!url) continue
      const domain = normalizeDomain(url.hostname)
      if (!isCompetitorCandidate(domain, params.targetHost)) continue
      out.push({
        domain,
        source: "serp",
        confidence: 0.9,
        rank: typeof result.position === "number" ? result.position : null,
        metadata: {
          title: result.title || null,
          query,
        },
      })
    }
    return out
  } catch {
    return []
  }
}

function discoverViaLinks(params: {
  targetHost: string
  links: ExternalLink[]
}): DiscoveredCompetitor[] {
  const buckets = new Map<string, { mentions: number; anchors: Set<string> }>()

  for (const link of params.links) {
    const url = safeUrl(link.href)
    if (!url) continue
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    const domain = normalizeDomain(url.hostname)
    if (!isCompetitorCandidate(domain, params.targetHost)) continue

    const current = buckets.get(domain) || { mentions: 0, anchors: new Set<string>() }
    current.mentions += 1
    const anchor = String(link.text || "").trim()
    if (anchor && anchor.length <= 120) current.anchors.add(anchor)
    buckets.set(domain, current)
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, 5)
    .map(([domain, value], index) => ({
      domain,
      source: "heuristic" as const,
      confidence: Math.min(0.8, 0.35 + value.mentions * 0.1),
      rank: index + 1,
      metadata: {
        mentions: value.mentions,
        anchors: [...value.anchors].slice(0, 5),
      },
    }))
}

export async function discoverCompetitors(params: {
  supabase: SupabaseClient
  scanId: string
  targetHost: string
}) {
  const { supabase, scanId, targetHost } = params
  const [{ data: keywordRows, error: keywordError }, { data: pageRows, error: pageError }] = await Promise.all([
    supabase
      .from("auditor_keywords")
      .select("keyword,keyword_type,confidence")
      .eq("scan_id", scanId)
      .order("confidence", { ascending: false })
      .limit(20),
    supabase
      .from("auditor_scan_pages")
      .select("extracted")
      .eq("scan_id", scanId)
      .eq("state", "extracted")
      .limit(50),
  ])
  if (keywordError) throw new Error(`discoverCompetitors keywords query failed: ${keywordError.message}`)
  if (pageError) throw new Error(`discoverCompetitors pages query failed: ${pageError.message}`)

  const topKeywords = (keywordRows || [])
    .filter((row: any) => row.keyword_type === "primary" || row.keyword_type === "secondary")
    .map((row: any) => String(row.keyword || "").trim())
    .filter(Boolean)
    .slice(0, 6)

  const allLinks: ExternalLink[] = []
  for (const page of pageRows || []) {
    const extracted = page?.extracted && typeof page.extracted === "object" ? (page.extracted as Record<string, unknown>) : {}
    const links = Array.isArray(extracted.contentLinks) ? extracted.contentLinks : []
    for (const link of links) {
      if (!link || typeof link !== "object") continue
      const href = String((link as any).href || "").trim()
      const text = String((link as any).text || "").trim()
      if (!href) continue
      allLinks.push({ href, text })
    }
  }

  const discovered = new Map<string, DiscoveredCompetitor>()
  for (const competitor of [...(await discoverViaSerp({ targetHost, seedKeywords: topKeywords })), ...discoverViaLinks({ targetHost, links: allLinks })]) {
    try {
      await resolveAndValidateHost({ hostname: competitor.domain })
    } catch {
      continue
    }
    const current = discovered.get(competitor.domain)
    if (!current || competitor.confidence > current.confidence) {
      discovered.set(competitor.domain, competitor)
    }
  }

  // Fallback safety: if no external signal survives, try a simple "https://<domain>" validation on common docs/framework references.
  if (discovered.size === 0) {
    for (const keyword of topKeywords.slice(0, 3)) {
      const candidate = normalizeDomain(keyword.split(/\s+/).join(""))
      if (!candidate || candidate.includes(".")) continue
      try {
        const url = normalizeInputUrl(`https://${candidate}.com`)
        await resolveAndValidateHost({ hostname: url.hostname })
        if (isCompetitorCandidate(url.hostname, targetHost)) {
          discovered.set(normalizeDomain(url.hostname), {
            domain: normalizeDomain(url.hostname),
            source: "heuristic",
            confidence: 0.3,
            rank: discovered.size + 1,
            metadata: { guess_from_keyword: keyword },
          })
        }
      } catch {
        // ignore
      }
    }
  }

  const { error: deleteError } = await supabase.from("auditor_competitors").delete().eq("scan_id", scanId)
  if (deleteError) throw new Error(`discoverCompetitors delete failed: ${deleteError.message}`)
  const rows = [...discovered.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((competitor, index) => ({
      scan_id: scanId,
      domain: competitor.domain,
      source: competitor.source,
      confidence: Number(competitor.confidence.toFixed(2)),
      rank: competitor.rank ?? index + 1,
      metadata: competitor.metadata,
    }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("auditor_competitors").insert(rows)
    if (insertError) throw new Error(`discoverCompetitors insert failed: ${insertError.message}`)
  }

  return rows
}
