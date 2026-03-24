export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { runIndexExtraction } from "@/lib/admin/index-extractor/crawl"
import { discoverSourcesFromGoogleQuery } from "@/lib/admin/index-extractor/google-search"
import type { RuntimeCaps, RunInput, SearchDiagnostics, SourceInput } from "@/lib/admin/index-extractor/types"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { requireSystemAdmin } from "@/lib/security/system-admin"

const sourceSchema = z.object({
  sourceUrl: z.string().min(1).max(2000),
  sourceLabel: z.string().max(120).optional(),
  crawlLimitPerSource: z.number().int().min(1).max(200).optional(),
})

const bodySchema = z
  .object({
    mode: z.enum(["manual", "google_search"]).optional(),
    sources: z.array(sourceSchema).max(50).optional(),
    googleQuery: z.string().max(300).optional(),
    googleResultLimit: z.number().int().min(1).max(20).optional(),
    googleCountry: z.string().min(2).max(5).optional(),
    googleLanguage: z.string().min(2).max(5).optional(),
    internalLinkMaxDepth: z.number().int().min(0).max(2).optional(),
    internalLinkMaxPagesPerDomain: z.number().int().min(0).max(5).optional(),
    maxPagesToVisit: z.number().int().min(1).max(1000).optional(),
    followInternalLinks: z.boolean().optional(),
    useRenderedFallback: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const mode = value.mode || "manual"
    if (mode === "google_search") {
      if (!String(value.googleQuery || "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["googleQuery"],
          message: "googleQuery is required in google_search mode",
        })
      }
      return
    }
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message: "sources is required in manual mode",
      })
    }
  })

function boundedEnvInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function getRuntimeCaps(): RuntimeCaps {
  return {
    // Hard, non-overridable run caps.
    maxTotalPages: boundedEnvInt(process.env.INDEX_EXTRACTOR_MAX_TOTAL_PAGES, 200, 100, 300),
    maxSeeds: boundedEnvInt(process.env.INDEX_EXTRACTOR_MAX_SEEDS, 15, 10, 20),
    maxRuntimeMs: boundedEnvInt(process.env.INDEX_EXTRACTOR_MAX_RUNTIME_MS, 45_000, 30_000, 60_000),
  }
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>
  try {
    admin = await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const rl = rateLimit({
    key: `admin-index-extractor:${admin.adminId}:${ip}`,
    limit: 4,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 })
  }

  const caps = getRuntimeCaps()
  const input = parsed.data as RunInput
  const runMode = input.mode || "manual"
  const resolvedFollowInternalLinks =
    runMode === "google_search" ? Boolean(input.followInternalLinks ?? false) : Boolean(input.followInternalLinks)
  const resolvedInternalLinkMaxDepth = runMode === "google_search" ? (input.internalLinkMaxDepth ?? 1) : input.internalLinkMaxDepth
  const resolvedInternalLinkMaxPagesPerDomain =
    runMode === "google_search" ? (input.internalLinkMaxPagesPerDomain ?? 2) : input.internalLinkMaxPagesPerDomain

  let sources: SourceInput[] = Array.isArray(input.sources) ? input.sources : []
  let searchDiagnostics: SearchDiagnostics | undefined

  if (runMode === "google_search") {
    const discovered = await discoverSourcesFromGoogleQuery({
      query: input.googleQuery || "",
      limit: input.googleResultLimit,
      country: input.googleCountry,
      language: input.googleLanguage,
      crawlLimitPerSource: undefined,
    })
    sources = discovered.sources
    searchDiagnostics = discovered.diagnostics
  }

  if (sources.length > caps.maxSeeds) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many sources. Maximum allowed per run is ${caps.maxSeeds}.`,
      },
      { status: 400 }
    )
  }
  if (runMode === "google_search" && sources.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "No candidate URLs discovered for this search query.",
        search_diagnostics: searchDiagnostics,
      },
      { status: 400 }
    )
  }

  const totalPayloadLength = JSON.stringify(body).length
  if (totalPayloadLength > 120_000) {
    return NextResponse.json({ ok: false, error: "Request payload too large" }, { status: 413 })
  }

  console.info(
    "[INDEX_EXTRACTOR_RUN]",
    JSON.stringify({
      adminId: admin.adminId,
      userId: admin.userId,
      mode: runMode,
      sourceCount: sources.length,
      searchQuery: runMode === "google_search" ? String(input.googleQuery || "").slice(0, 120) : undefined,
      followInternalLinks: resolvedFollowInternalLinks,
      internalLinkMaxDepth: resolvedInternalLinkMaxDepth,
      internalLinkMaxPagesPerDomain: resolvedInternalLinkMaxPagesPerDomain,
      useRenderedFallback: Boolean(input.useRenderedFallback),
      caps,
    })
  )

  const result = await runIndexExtraction({
    input: {
      ...input,
      sources,
      followInternalLinks: resolvedFollowInternalLinks,
      internalLinkMaxDepth: resolvedInternalLinkMaxDepth,
      internalLinkMaxPagesPerDomain: resolvedInternalLinkMaxPagesPerDomain,
    },
    caps,
  })

  return NextResponse.json({
    ok: true,
    rows: result.rows,
    errors: result.errors,
    skipped: result.skipped,
    page_debug: result.page_debug,
    summary: result.summary,
    search_diagnostics: searchDiagnostics || result.search_diagnostics,
    caps,
  })
}
