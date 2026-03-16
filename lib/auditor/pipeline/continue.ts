import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { auditorLog } from "../log"
import { fetchTextBounded } from "../fetch"
import { followRedirectsWithValidation, normalizeInputUrl } from "../ssrf"
import { parseSitemapXml } from "../sitemap"
import { pickSamplePages, shouldSkipByExtension } from "../sample"
import { extractFromHtml } from "../extract"
import { extractPageAnalysis, extractPageContent } from "../analysis/content-extract"
import { buildKeywordExtractionContext, extractKeywords, persistKeywords } from "../analysis/keywords"
import { runKeywordEngine } from "../analysis/keyword-engine"
import { discoverTopics } from "../analysis/topics"
import { calculateAIScore, summarizeAIReadiness } from "../analysis/ai-readiness"
import { discoverCompetitors } from "../analysis/competitors"
import { crawlCompetitorPages } from "../analysis/competitor-crawler"
import { extractCompetitorKeywords } from "../analysis/competitor-keywords"
import { analyzeContentGaps } from "../analysis/content-gaps"
import { generateRecommendations } from "../analysis/recommendations"
import { runRulesAndScore } from "../rules/runner"
import { buildPublicReport, buildMinimalReport, type ConfidenceLevel } from "../report/public"
import { buildAdminReport } from "../report/admin"
import { applyCompanyWhere, applyScanWhere } from "../db/scanWhere"
import { captureSiteScreenshot } from "../screenshot"

type ContinueOk =
  | { ok: true; kind: "progressed"; scan: any }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "forbidden" | "invalid_state"; message: string }

function nowIso() {
  return new Date().toISOString()
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {}
}

function uniqStrings(values: string[], limit = 5): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).slice(0, limit)
}

async function collectAiFilesArtifacts(origin: string) {
  const llmsUrl = `${origin}/llms.txt`
  const aiJsonUrl = `${origin}/.well-known/ai.json`
  const brandUrl = `${origin}/brand.json`

  const [llms, aiJson, brand] = await Promise.all([
    fetchTextBounded({ url: llmsUrl, timeoutMs: 1200, maxBytes: 200_000 }),
    fetchTextBounded({ url: aiJsonUrl, timeoutMs: 1200, maxBytes: 200_000 }),
    fetchTextBounded({ url: brandUrl, timeoutMs: 1200, maxBytes: 200_000 }),
  ])

  const pack = (r: any, url: string) => ({
    url,
    found: r.ok && r.status >= 200 && r.status < 300,
    status: r.ok ? r.status : null,
    bytes: r.ok ? r.bytes : null,
    preview: r.ok ? String(r.text || "").slice(0, 2000) : null,
  })

  return {
    llms_txt: pack(llms, llmsUrl),
    ai_json: pack(aiJson, aiJsonUrl),
    brand_json: pack(brand, brandUrl),
  }
}

function safeUrlPath(u: string): string | null {
  try {
    return new URL(u).pathname || "/"
  } catch {
    return null
  }
}

function parseRobotsSitemaps(text: string, origin: string): string[] {
  const out: string[] = []
  const lines = String(text || "").split(/\r?\n/g)
  for (const line of lines) {
    const m = line.match(/^\s*sitemap\s*:\s*(.+)\s*$/i)
    if (!m) continue
    const raw = String(m[1] || "").trim()
    if (!raw) continue
    try {
      out.push(new URL(raw, origin).toString())
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(out))
}

export async function continueAuditorScan(params: {
  scanId: string
  companyId?: string | null
  supabase?: SupabaseClient
  requestId?: string
}): Promise<ContinueOk> {
  const supabase = params.supabase ?? (await createClient())
  const requestId = params.requestId ?? randomUUID()
  const lockedAt = nowIso()
  const staleBefore = new Date(Date.now() - 30_000).toISOString()

  // Idempotency: avoid lock acquisition for terminal scans.
  // Also fixes "not found" vs "busy" ambiguity for missing scans.
  {
    let q = supabase.from("auditor_scans").select("id,status,step,company_id").eq("id", params.scanId)
    if (params.companyId !== undefined) {
      q = params.companyId === null ? q.is("company_id", null) : q.eq("company_id", params.companyId)
    }
    const { data: pre, error } = await q.maybeSingle()
    if (error) {
      console.error("[auditor] pre-check error", { message: error.message, code: error.code })
      return { ok: false, kind: "invalid_state", message: "precheck_failed" }
    }
    if (!pre) return { ok: false, kind: "not_found" }
    const st = String((pre as any).status || "")
    if (st === "done") return { ok: true, kind: "progressed", scan: pre }
    if (st === "failed") return { ok: false, kind: "invalid_state", message: "scan_failed" }
  }

  // Acquire lock.
  // Try: (A) unlocked, then (B) stale takeover. Avoid PostgREST .or(...) edge-cases.
  const lockPatch = {
    locked_at: lockedAt,
    locked_by: requestId,
    status: "running",
    updated_at: lockedAt,
  } as const

  // (A) Acquire when unlocked
  let lockedScan: any = null
  {
    let q = supabase
      .from("auditor_scans")
      .update(lockPatch)
      .eq("id", params.scanId)
      .in("status", ["queued", "running"])
      .is("locked_at", null)
      .select("*")
    if (params.companyId !== undefined) {
      q = params.companyId === null ? q.is("company_id", null) : q.eq("company_id", params.companyId)
    }
    const { data, error } = await q.maybeSingle()

    if (error) {
      console.error("[auditor] lock acquisition error(A)", { message: error.message, code: error.code })
      return { ok: false, kind: "invalid_state", message: "lock_failed" }
    }
    lockedScan = data
  }

  // (B) Take over stale lock
  if (!lockedScan) {
    let q = supabase
      .from("auditor_scans")
      .update(lockPatch)
      .eq("id", params.scanId)
      .in("status", ["queued", "running"])
      .lt("locked_at", staleBefore)
      .select("*")
    if (params.companyId !== undefined) {
      q = params.companyId === null ? q.is("company_id", null) : q.eq("company_id", params.companyId)
    }
    const { data, error } = await q.maybeSingle()

    if (error) {
      console.error("[auditor] lock acquisition error(B)", { message: error.message, code: error.code })
      return { ok: false, kind: "invalid_state", message: "lock_failed" }
    }
    lockedScan = data
  }

  if (!lockedScan) return { ok: false, kind: "busy" }

  const scanId = String(lockedScan.id)
  const companyId = lockedScan.company_id ? String(lockedScan.company_id) : null

  const releaseLock = async (patch: Record<string, any> = {}) => {
    await supabase
      .from("auditor_scans")
      .update({
        ...patch,
        locked_at: null,
        locked_by: null,
        updated_at: nowIso(),
      })
      .eq("id", scanId)
      .eq("locked_by", requestId)
  }

  try {
    const step = String(lockedScan.step || "normalize")
    const artifacts = (lockedScan.artifacts || {}) as any
    const targetUrl = String(lockedScan.target_url || "")
    const normalizedUrl = lockedScan.normalized_url ? String(lockedScan.normalized_url) : null
    const hostname = lockedScan.hostname ? String(lockedScan.hostname) : null
    const pageLimit = Number.isFinite(Number(lockedScan.page_limit)) ? Math.max(1, Number(lockedScan.page_limit)) : 10

    await supabase.from("auditor_scans").update({ heartbeat_at: nowIso() }).eq("id", scanId).eq("locked_by", requestId)
    await auditorLog({ supabase, scanId, companyId, level: "debug", message: "continue:start", data: { step, requestId } })
    console.info("[auditor] scan step", step)

    // Step: normalize
    if (step === "normalize") {
      const input = normalizeInputUrl(targetUrl)
      const { finalUrl, redirects } = await followRedirectsWithValidation({ startUrl: input, maxRedirects: 5, timeoutMs: 1500 })
      const origin = finalUrl.origin.replace(/\/+$/, "")

      const nextArtifacts = { ...artifacts, redirects }
      await applyScanWhere(
        supabase.from("auditor_scans").update({
          normalized_url: origin,
          hostname: finalUrl.hostname,
          started_at: lockedScan.started_at || nowIso(),
          step: "robots",
          artifacts: nextArtifacts,
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      // Best-effort screenshot capture (do NOT fail scan if it errors).
      try {
        const { publicPath } = await captureSiteScreenshot({ scanId, url: origin, supabase })
        await applyScanWhere(
          supabase.from("auditor_scans").update({
            artifacts: { ...nextArtifacts, screenshot_url: publicPath },
            updated_at: nowIso(),
          }),
          scanId,
          companyId
        )
      } catch (e: any) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "warn",
          message: "screenshot:failed",
          data: { message: String(e?.message || e) },
        })
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "normalize:ok",
        data: { origin, hostname: finalUrl.hostname, redirectsCount: redirects.length },
      })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    const origin = (normalizedUrl || "").replace(/\/+$/, "")
    const hostLock = hostname || (() => {
      try {
        return origin ? new URL(origin).hostname : null
      } catch {
        return null
      }
    })()
    if (!origin || !hostLock) {
      await releaseLock({ status: "failed", error: "missing_normalized_url", step: "normalize", finished_at: nowIso() })
      return { ok: false, kind: "invalid_state", message: "missing_normalized_url" }
    }

    // Step: robots
    if (step === "robots") {
      const robotsUrl = `${origin}/robots.txt`
      const r = await fetchTextBounded({ url: robotsUrl, timeoutMs: 1200, maxBytes: 200_000 })
      const found = r.ok && r.status >= 200 && r.status < 300
      const robotsText = r.ok ? r.text : ""
      const sitemapHints = found ? parseRobotsSitemaps(robotsText, origin) : []

      const nextArtifacts = {
        ...artifacts,
        robots: {
          url: robotsUrl,
          found,
          status: r.ok ? r.status : null,
          bytes: r.ok ? r.bytes : null,
        },
        robots_preview: found ? robotsText.slice(0, 5000) : null,
        sitemap_hints: sitemapHints,
      }

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          artifacts: nextArtifacts,
          step: "sitemap",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "robots:done",
        data: { found, status: r.ok ? r.status : null, sitemapHintsCount: sitemapHints.length },
      })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: sitemap
    if (step === "sitemap") {
      const hints: string[] = Array.isArray(artifacts?.sitemap_hints) ? artifacts.sitemap_hints : []
      const primary = String(artifacts?.sitemap?.url || hints[0] || `${origin}/sitemap.xml`)

      const cap = 2000
      const addUrl = (acc: string[], u: string) => {
        if (acc.length >= cap) return acc
        try {
          const uu = new URL(u)
          if (uu.hostname.toLowerCase() !== hostLock.toLowerCase()) return acc
          if (uu.protocol !== "http:" && uu.protocol !== "https:") return acc
          if (uu.port && uu.port !== "80" && uu.port !== "443") return acc
          if (shouldSkipByExtension(uu.toString())) return acc
          acc.push(uu.toString())
        } catch {
          // ignore
        }
        return acc
      }

      const existingUrls: string[] = Array.isArray(artifacts?.sitemap?.urls) ? artifacts.sitemap.urls : []
      const existingChild: string[] = Array.isArray(artifacts?.sitemap?.child_sitemaps) ? artifacts.sitemap.child_sitemaps : []
      const childIndex: number = Number.isFinite(Number(artifacts?.sitemap?.child_index)) ? Number(artifacts.sitemap.child_index) : 0

      // First run: fetch primary sitemap, parse, and store index children (if any).
      if (!artifacts?.sitemap || artifacts.sitemap.url !== primary) {
        const fetched = await fetchTextBounded({ url: primary, timeoutMs: 1500, maxBytes: 1_000_000 })
        let urls: string[] = []
        let childSitemaps: string[] = []
        if (fetched.ok && fetched.status >= 200 && fetched.status < 300) {
          const parsed = parseSitemapXml(fetched.text)
          urls = parsed.urls
          childSitemaps = parsed.childSitemaps
        }

        const acc: string[] = []
        urls.forEach((u) => addUrl(acc, u))

        const nextArtifacts = {
          ...artifacts,
          sitemap: {
            url: primary,
            ok: fetched.ok && fetched.status >= 200 && fetched.status < 300,
            status: fetched.ok ? fetched.status : null,
            is_index: childSitemaps.length > 0,
            child_sitemaps: childSitemaps,
            child_sitemaps_count: childSitemaps.length,
            child_index: 0,
            urls: acc,
            url_count: acc.length,
          },
        }

        await applyScanWhere(supabase.from("auditor_scans").update({ artifacts: nextArtifacts, updated_at: nowIso() }), scanId, companyId)

        await auditorLog({
          supabase,
          scanId,
          companyId,
          message: "sitemap:primary_done",
          data: { sitemapUrl: primary, urlCount: acc.length, isIndex: childSitemaps.length > 0 },
        })

        // If not an index, we can advance immediately.
        if (childSitemaps.length === 0) {
          await applyScanWhere(supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }), scanId, companyId)
          await auditorLog({ supabase, scanId, companyId, message: "sitemap:done", data: { nextStep: "ai_files" } })
        }

        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      // Subsequent runs for sitemapindex: fetch ONE child sitemap per continue to stay within budget.
      if (existingChild.length > 0 && existingUrls.length < cap && childIndex < existingChild.length) {
        const childUrl = existingChild[childIndex]
        const smRes = await fetchTextBounded({ url: childUrl, timeoutMs: 1500, maxBytes: 1_000_000 })
        const acc = [...existingUrls]
        if (smRes.ok && smRes.status >= 200 && smRes.status < 300) {
          const parsedChild = parseSitemapXml(smRes.text)
          parsedChild.urls.forEach((u) => addUrl(acc, u))
        }

        const nextArtifacts = {
          ...artifacts,
          sitemap: {
            ...artifacts.sitemap,
            child_index: childIndex + 1,
            urls: acc,
            url_count: acc.length,
          },
        }
        await applyScanWhere(supabase.from("auditor_scans").update({ artifacts: nextArtifacts, updated_at: nowIso() }), scanId, companyId)
        await auditorLog({ supabase, scanId, companyId, message: "sitemap:child_processed", data: { childIndex, childUrl, urlCount: acc.length } })

        // Advance when finished children or hit cap.
        const done = childIndex + 1 >= existingChild.length || acc.length >= cap
        if (done) {
          await applyScanWhere(supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }), scanId, companyId)
          await auditorLog({ supabase, scanId, companyId, message: "sitemap:done", data: { urlCount: acc.length, nextStep: "ai_files" } })
        }

        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      // Nothing left to do.
      await applyScanWhere(supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }), scanId, companyId)
      await auditorLog({ supabase, scanId, companyId, message: "sitemap:done", data: { nextStep: "ai_files" } })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: ai_files
    if (step === "ai_files") {
      await auditorLog({ supabase, scanId, companyId, message: "ai_files:start" })

      const nextArtifacts = {
        ...artifacts,
        ai_files: await collectAiFilesArtifacts(origin),
      }

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          artifacts: nextArtifacts,
          step: "sample",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({ supabase, scanId, companyId, message: "ai_files:done", data: { nextStep: "sample" } })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: sample (insert queued pages)
    if (step === "sample") {
      let nextArtifacts = { ...artifacts }

      const sitemapUrls: string[] = Array.isArray(artifacts?.sitemap?.urls) ? artifacts.sitemap.urls : []
      const sample = pickSamplePages({ origin, hostLock, sitemapUrls, maxPages: pageLimit })
      let existingUrlsQuery = supabase.from("auditor_scan_pages").select("url").eq("scan_id", scanId)
      existingUrlsQuery = applyCompanyWhere(existingUrlsQuery, companyId)
      const { data: existingPageRows } = await existingUrlsQuery
      const existingUrls = new Set(
        (Array.isArray(existingPageRows) ? existingPageRows : [])
          .map((row: any) => String(row?.url || "").trim())
          .filter(Boolean)
      )
      const missingSampleUrls = sample.filter((url) => !existingUrls.has(url))

      const rows = missingSampleUrls.map((u) => ({
        scan_id: scanId,
        company_id: companyId,
        url: u,
        path: safeUrlPath(u),
        state: "queued",
      }))

      if (rows.length > 0) {
        const { error } = await supabase.from("auditor_scan_pages").upsert(rows, { onConflict: "scan_id,url" })
        if (error) {
          await auditorLog({ supabase, scanId, companyId, level: "error", message: "sample:upsert_failed", data: { message: error.message } })
        }
      }

      nextArtifacts = {
        ...nextArtifacts,
        sample: { urls: sample, count: sample.length, pageLimit },
      }

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          artifacts: nextArtifacts,
          step: "fetch_pages",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({ supabase, scanId, companyId, message: "sample:done", data: { count: sample.length } })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: fetch_pages (fetch up to 5 queued pages per continue for time budget)
    if (step === "fetch_pages") {
      let q = supabase.from("auditor_scan_pages").select("id,url").eq("scan_id", scanId).eq("state", "queued").limit(5)
      q = applyCompanyWhere(q, companyId)
      const { data: queuedPages } = await q

      const pages = Array.isArray(queuedPages) ? queuedPages : []
      if (pages.length === 0) {
        // Fail-safe: if no fetched pages at all, finalize with minimal report so dashboard receives a result
        let countQ = supabase
          .from("auditor_scan_pages")
          .select("id", { count: "exact", head: true })
          .eq("scan_id", scanId)
          .in("state", ["fetched", "extracted"])
        countQ = applyCompanyWhere(countQ, companyId)
        const { count: fetchedCount } = await countQ
        const hasFetched = (fetchedCount ?? 0) > 0

        if (!hasFetched) {
          const sampleUrls = Array.isArray(artifacts?.sample?.urls) ? artifacts.sample.urls : []
          const minimalReport = buildMinimalReport()
          await applyScanWhere(
            supabase.from("auditor_scans").update({
              status: "done",
              step: "done",
              score_total: 0,
              report_public: minimalReport,
              artifacts: { ...artifacts, sample: { urls: sampleUrls, count: sampleUrls.length } },
              finished_at: nowIso(),
              updated_at: nowIso(),
            }),
            scanId,
            companyId
          )
          await auditorLog({ supabase, scanId, companyId, message: "fetch_pages:fail_safe_no_pages" })
          await releaseLock()
          const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
          return { ok: true, kind: "progressed", scan }
        }

        await applyScanWhere(supabase.from("auditor_scans").update({ step: "extract", updated_at: nowIso() }), scanId, companyId)
        await auditorLog({ supabase, scanId, companyId, message: "fetch_pages:none_left" })
        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      await auditorLog({ supabase, scanId, companyId, message: "fetch_pages:start", data: { count: pages.length } })

      for (const p of pages) {
        const url = String((p as any).url)
        const res = await fetchTextBounded({
          url,
          timeoutMs: 1800,
          maxBytes: 400_000,
          headers: { "user-agent": "VOW-Auditor-POC/1.0" },
        })

        const contentType = res.ok ? res.contentType : null
        const isHtml = contentType ? contentType.toLowerCase().includes("text/html") : true

        if (res.ok && res.status >= 200 && res.status < 300 && isHtml) {
          await applyCompanyWhere(
            supabase.from("auditor_scan_pages").update({
              state: "fetched",
              status_code: res.status,
              content_type: contentType,
              headers: res.headers || {},
              fetch_ms: res.elapsedMs,
              content_bytes: res.bytes,
              html: res.text,
              fetched_at: nowIso(),
            }).eq("id", (p as any).id),
            companyId
          )
        } else if (res.ok && res.status >= 200 && res.status < 300 && !isHtml) {
          await applyCompanyWhere(
            supabase.from("auditor_scan_pages").update({
              state: "skipped",
              status_code: res.status,
              content_type: contentType,
              headers: res.headers || {},
              fetch_ms: res.elapsedMs,
              content_bytes: res.bytes,
              error: "non_html",
              fetched_at: nowIso(),
            }).eq("id", (p as any).id),
            companyId
          )
        } else {
          await applyCompanyWhere(
            supabase.from("auditor_scan_pages").update({
              state: "failed",
              status_code: res.ok ? res.status : null,
              content_type: contentType,
              headers: res.ok ? res.headers || {} : {},
              fetch_ms: res.elapsedMs,
              content_bytes: res.ok ? res.bytes : null,
              error: res.ok ? `http_${res.status}` : res.error,
              fetched_at: nowIso(),
            }).eq("id", (p as any).id),
            companyId
          )
        }
      }

      await auditorLog({ supabase, scanId, companyId, message: "fetch_pages:batch_done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: extract (extract up to 5 fetched pages)
    if (step === "extract") {
      let q = supabase.from("auditor_scan_pages").select("id,url,path,html").eq("scan_id", scanId).eq("state", "fetched").limit(5)
      q = applyCompanyWhere(q, companyId)
      const { data: fetchedPages } = await q

      const pages = Array.isArray(fetchedPages) ? fetchedPages : []
      if (pages.length === 0) {
        await applyScanWhere(supabase.from("auditor_scans").update({ step: "keyword_analysis", updated_at: nowIso() }), scanId, companyId)
        await auditorLog({ supabase, scanId, companyId, message: "extract:none_left" })
        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      await auditorLog({ supabase, scanId, companyId, message: "extract:start", data: { count: pages.length } })

      for (const p of pages) {
        const html = String((p as any).html || "")
        const pageUrl = String((p as any).url || "")
        const extracted = extractFromHtml(html, pageUrl)
        const content = extractPageContent(html, pageUrl)
        const analysis = extractPageAnalysis(html)
        const questionParagraphsCount = content.paragraphs.filter((paragraph) => paragraph.includes("?")).length
        const wordCount = content.paragraphs.join(" ").split(/\s+/).filter(Boolean).length

        await applyCompanyWhere(
          supabase.from("auditor_scan_pages").update({
            state: "extracted",
            html: null,
            title: extracted.title,
            meta_description: extracted.metaDescription,
            canonical: extracted.canonical,
            lang: extracted.lang,
            dir: extracted.dir,
            has_og: extracted.hasOg,
            has_twitter: extracted.hasTwitter,
            jsonld_types: extracted.jsonldTypes,
            tracking: extracted.tracking,
            analysis,
            extracted: {
              metaRobots: extracted.metaRobots,
              viewportPresent: extracted.viewportPresent,
              hasFAQPage: extracted.hasFAQPage,
              hasArticle: extracted.hasArticle,
              h1Count: extracted.h1Count,
              headingsOutline: extracted.headingsOutline,
              imagesMissingAltCount: extracted.imagesMissingAltCount,
              internalLinksCount: extracted.internalLinksCount,
              questionHeadingsCount: extracted.questionHeadingsCount,
              contentTitle: content.title,
              contentHeadings: content.headings,
              contentParagraphs: content.paragraphs,
              contentLinks: content.links,
              contentEntities: content.entities,
              questionParagraphsCount,
              wordCount,
            },
            extracted_at: nowIso(),
          }).eq("id", (p as any).id),
          companyId
        )
      }

      await auditorLog({ supabase, scanId, companyId, message: "extract:batch_done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: keyword_engine / keyword_analysis (keyword engine enriches, keyword_analysis remains canonical)
    if (step === "keyword_engine" || step === "keyword_analysis") {
      await auditorLog({ supabase, scanId, companyId, message: "keyword_analysis:start" })
      const currentAdminReport = toRecord(lockedScan.report_admin)
      let keywordEngineReport: Record<string, unknown> = {
        keywords: [],
        topics: [],
        clusters: [],
        counts: { pages: 0, keywords: 0, topics: 0, clusters: 0 },
        skipped: true,
      }

      try {
        const result = await runKeywordEngine({ supabase, scanId })
        keywordEngineReport = {
          keywords: result.keywords,
          topics: result.topics,
          clusters: result.clusters,
          counts: result.counts,
          skipped: result.skipped,
        }

        await auditorLog({
          supabase,
          scanId,
          companyId,
          message: "keyword_analysis:engine_extract_keywords",
          data: {
            pagesCount: result.counts.pages,
            keywordsCount: result.counts.keywords,
            skipped: result.skipped,
          },
        })
        await auditorLog({
          supabase,
          scanId,
          companyId,
          message: "keyword_analysis:engine_cluster_topics",
          data: {
            topicsCount: result.counts.topics,
            clustersCount: result.counts.clusters,
          },
        })
      } catch (error: any) {
        keywordEngineReport = {
          ...keywordEngineReport,
          error: String(error?.message || error),
          skipped: true,
        }
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "warn",
          message: "keyword_analysis:engine_failed",
          data: { message: String(error?.message || error) },
        })
      }

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_admin: {
            ...currentAdminReport,
            keyword_engine: keywordEngineReport,
          },
          step: "topic_discovery",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "keyword_analysis:done",
        data: {
          pagesCount: Number((keywordEngineReport.counts as any)?.pages || 0),
          keywordsCount: Number((keywordEngineReport.counts as any)?.keywords || 0),
          topicsCount: Number((keywordEngineReport.counts as any)?.topics || 0),
          clustersCount: Number((keywordEngineReport.counts as any)?.clusters || 0),
          skipped: Boolean(keywordEngineReport.skipped),
        },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: keyword_analysis (derive page keywords from extracted content)
    if (step === "keyword_analysis") {
      await auditorLog({ supabase, scanId, companyId, message: "keyword_analysis:start" })
      let q = supabase
        .from("auditor_scan_pages")
        .select("id,title,extracted")
        .eq("scan_id", scanId)
        .eq("state", "extracted")
        .limit(50)
      q = applyCompanyWhere(q, companyId)
      const { data: extractedPages } = await q
      const pages = Array.isArray(extractedPages) ? extractedPages : []
      const { data: competitorKeywordRows } = await supabase
        .from("auditor_competitor_keywords")
        .select("keyword")
        .eq("scan_id", scanId)
      let totalKeywords = 0

      await supabase.from("auditor_keywords").delete().eq("scan_id", scanId)

      const pageContents = pages.map((page) => {
        const extracted = toRecord((page as any).extracted)
        return {
          id: String((page as any).id),
          content: {
            title: typeof extracted.contentTitle === "string" ? extracted.contentTitle : (page as any).title || null,
            headings: Array.isArray(extracted.contentHeadings) ? extracted.contentHeadings : [],
            paragraphs: Array.isArray(extracted.contentParagraphs) ? extracted.contentParagraphs : [],
            links: Array.isArray(extracted.contentLinks) ? extracted.contentLinks : [],
            entities: Array.isArray(extracted.contentEntities) ? extracted.contentEntities : [],
          },
        }
      })
      const keywordContext = buildKeywordExtractionContext({
        pages: pageContents.map((page) => page.content),
        competitorKeywords: (competitorKeywordRows || []).map((row: any) => String(row.keyword || "")),
      })

      for (const page of pageContents) {
        const keywords = extractKeywords(page.content, keywordContext)

        await persistKeywords({
          supabase,
          scanId,
          pageId: page.id,
          keywords,
        })
        totalKeywords += keywords.length
      }

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          step: "topic_discovery",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      await auditorLog({ supabase, scanId, companyId, message: "keyword_analysis:done", data: { pagesCount: pages.length, keywordsCount: totalKeywords } })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: topic_discovery (group scan-wide keyword themes)
    if (step === "topic_discovery") {
      await auditorLog({ supabase, scanId, companyId, message: "topic_discovery:start" })
      const topics = await discoverTopics({ supabase, scanId })

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          step: "rules",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      await auditorLog({ supabase, scanId, companyId, message: "topic_discovery:done", data: { topicsCount: topics.length } })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: rules (compute + persist rule rows + score)
    if (step === "rules") {
      // Load existing rules BEFORE delete (fallback if runRulesAndScore returns empty)
      let rulesFromDb: Array<{ rule_key: string; category: string; status: string; impact: string; effort: string; recommendation_he: string; evidence: unknown }> = []
      {
        let qRules = supabase.from("auditor_scan_rules").select("rule_key,category,status,impact,effort,recommendation_he,evidence").eq("scan_id", scanId)
        qRules = applyCompanyWhere(qRules, companyId)
        const { data: existing } = await qRules
        rulesFromDb = Array.isArray(existing) ? existing : []
      }

      let q = supabase
        .from("auditor_scan_pages")
        .select("url,path,title,meta_description,canonical,extracted,lang,dir,has_og,has_twitter,jsonld_types,tracking")
        .eq("scan_id", scanId)
        .eq("state", "extracted")
        .limit(50)
      q = applyCompanyWhere(q, companyId)
      const { data: pages } = await q

      const pagesArr = Array.isArray(pages) ? pages : []
      const ctx = {
        scan: {
          target_url: targetUrl,
          normalized_url: origin,
          hostname: hostLock,
          artifacts: artifacts,
        },
        pages: pagesArr as any[],
      }

      const { rules, scoreTotal, scoreBreakdown } = runRulesAndScore(ctx)

      // Guardrails: log when rules unexpectedly empty (no sensitive data)
      const rulesRawCount = rules.length
      const pagesCount = pagesArr.length
      if (rulesRawCount === 0 && (pagesCount > 0 || rulesFromDb.length > 0)) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "warn",
          message: "rules:empty_unexpected",
          data: { rulesRawCount, pagesCount, rulesFromDbCount: rulesFromDb.length },
        })
        if (process.env.NODE_ENV === "development" && process.env.AUDITOR_STRICT_REPORT === "1") {
          throw new Error(`[auditor] rules empty but pages=${pagesCount} rulesFromDb=${rulesFromDb.length}`)
        }
      }

      await supabase.from("auditor_scan_rules").delete().eq("scan_id", scanId)

      if (rules.length > 0) {
        const rows = rules.map((r) => ({
          scan_id: scanId,
          company_id: companyId,
          rule_key: r.rule_key,
          category: r.category,
          weight: r.weight,
          status: r.status,
          impact: r.impact,
          effort: r.effort,
          evidence: r.evidence,
          recommendation_he: r.recommendation_he,
        }))
        await supabase.from("auditor_scan_rules").insert(rows)
      }

      // Persist findings (admin/internal)
      await supabase.from("auditor_scan_findings").delete().eq("scan_id", scanId)
      if (rules.length > 0) {
        const findingsRows = rules.map((r) => ({
          scan_id: scanId,
          company_id: companyId,
          rule_key: r.rule_key,
          severity: r.status === "fail" ? "high" : r.status === "warn" ? "medium" : "low",
          status: r.status,
          scope: "site",
          url: null,
          title: r.recommendation_he,
          summary: r.recommendation_he,
          recommendation: r.recommendation_he,
          evidence: r.evidence,
        }))
        await supabase.from("auditor_scan_findings").insert(findingsRows)
      }

      // Coverage/confidence (simple)
      const { data: pageStates } = await supabase.from("auditor_scan_pages").select("state").eq("scan_id", scanId)
      const states = Array.isArray(pageStates) ? pageStates.map((r: any) => String(r.state)) : []
      const extractedCount = states.filter((s) => s === "extracted").length
      const totalCount = states.length
      const confidenceLevel: ConfidenceLevel = extractedCount >= 10 ? "high" : extractedCount >= 5 ? "medium" : "low"
      const warning = confidenceLevel === "low" ? "לא הצלחנו למשוך מספיק עמודים, התוצאה חלקית." : undefined

      const scoreSearch = Math.round(((scoreBreakdown.technical ?? 0) + (scoreBreakdown.schema ?? 0)) / 2)
      const scoreAi = Math.round(scoreBreakdown.ai_readiness ?? 0)

      const publicReport = buildPublicReport({
        score_total: scoreTotal,
        score_search: scoreSearch,
        score_ai: scoreAi,
        category_scores: { search_readiness: scoreSearch, ai_readiness: scoreAi },
        findings: rules.map((r) => ({ rule_key: r.rule_key, severity: "medium", status: r.status })),
        confidence_level: confidenceLevel,
        warning,
      })

      // Use rules from runRulesAndScore; fallback to DB if empty (e.g. crash recovery)
      const rulesForReport =
        rules.length > 0
          ? rules.map((r) => ({
              rule_key: r.rule_key,
              category: r.category,
              status: r.status,
              impact: r.impact,
              effort: r.effort,
              recommendation_he: r.recommendation_he,
              evidence: r.evidence,
            }))
          : rulesFromDb.map((r) => ({
              rule_key: r.rule_key,
              category: r.category,
              status: r.status,
              impact: r.impact,
              effort: r.effort,
              recommendation_he: r.recommendation_he,
              evidence: r.evidence,
            }))

      const issuesOverview =
        rulesForReport.length > 0
          ? rulesForReport
              .filter((r) => r.status === "fail" || r.status === "warn")
              .map((r) => r.recommendation_he)
              .filter(Boolean)
          : []
      const currentAdminReport = toRecord(lockedScan.report_admin)
      const adminReport = buildAdminReport({
        score_total: scoreTotal,
        score_search: scoreSearch,
        score_ai: scoreAi,
        score_breakdown: scoreBreakdown,
        category_scores: { search_readiness: scoreSearch, ai_readiness: scoreAi },
        rules: rulesForReport,
        total_pages: totalCount,
        extracted_pages: extractedCount,
        confidence_level: confidenceLevel,
        warning,
        issues_overview: issuesOverview.length > 0 ? issuesOverview : ["לא נמצאו בעיות מהותיות בבדיקה הראשונית."],
      })

      const updateQuery = applyScanWhere(
        supabase.from("auditor_scans").update({
          score_total: scoreTotal,
          score_breakdown: scoreBreakdown,
          coverage: { total_pages: totalCount, extracted_pages: extractedCount },
          confidence: { level: confidenceLevel, warning },
          report_public: publicReport,
          report_admin: {
            ...currentAdminReport,
            ...adminReport,
          },
          step: "ai_readiness",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      const { error: updateErr } = await updateQuery

      if (updateErr) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "rules:update_failed",
          data: { message: updateErr.message, code: updateErr.code },
        })
        throw new Error(`auditor_scans update failed: ${updateErr.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "rules:done",
        data: { scoreTotal, scoreBreakdown, rulesCount: rulesForReport.length },
      })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: ai_readiness (score pages for AI-answer readiness)
    if (step === "ai_readiness") {
      await auditorLog({ supabase, scanId, companyId, message: "ai_readiness:start" })
      let q = supabase
        .from("auditor_scan_pages")
        .select("id,title,url,jsonld_types,extracted")
        .eq("scan_id", scanId)
        .eq("state", "extracted")
        .limit(50)
      q = applyCompanyWhere(q, companyId)
      const { data: extractedPages } = await q
      const pages = Array.isArray(extractedPages) ? extractedPages : []
      const scores: number[] = []
      const allStrengths: string[] = []
      const allGaps: string[] = []

      for (const page of pages) {
        const result = calculateAIScore({
          title: (page as any).title || null,
          jsonld_types: Array.isArray((page as any).jsonld_types) ? (page as any).jsonld_types : [],
          extracted: toRecord((page as any).extracted),
          ai_files: toRecord(artifacts.ai_files),
        })
        const summary = summarizeAIReadiness(result)

        scores.push(result.ai_score)
        allStrengths.push(...summary.strengths)
        allGaps.push(...summary.gaps)

        await applyCompanyWhere(
          supabase.from("auditor_scan_pages").update({
            ai_analysis: result,
          }).eq("id", (page as any).id),
          companyId
        )
      }

      const averageAiScore = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
      const currentPublicReport = toRecord(lockedScan.report_public)
      const currentAdminReport = toRecord(lockedScan.report_admin)
      const currentCategoryScores = toRecord(currentPublicReport.category_scores)
      const currentScoreBreakdown = toRecord(lockedScan.score_breakdown)
      const aiSummary = {
        average_score: averageAiScore,
        pages_analyzed: pages.length,
        top_strengths: uniqStrings(allStrengths),
        top_gaps: uniqStrings(allGaps),
      }

      const { error: aiUpdateError } = await applyScanWhere(
        supabase.from("auditor_scans").update({
          score_breakdown: {
            ...currentScoreBreakdown,
            ai_readiness: averageAiScore,
          },
          report_public: {
            ...currentPublicReport,
            score_ai: averageAiScore,
            category_scores: {
              ...currentCategoryScores,
              ai_readiness: averageAiScore,
            },
            ai_readiness_summary: aiSummary,
          },
          report_admin: {
            ...currentAdminReport,
            score_ai: averageAiScore,
            category_scores: {
              ...toRecord(currentAdminReport.category_scores),
              ai_readiness: averageAiScore,
            },
            ai_readiness_summary: aiSummary,
          },
          step: "competitor_discovery",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      if (aiUpdateError) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "ai_readiness:update_failed",
          data: { message: aiUpdateError.message, code: aiUpdateError.code },
        })
        throw new Error(`ai_readiness update failed: ${aiUpdateError.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "ai_readiness:done",
        data: { pagesCount: pages.length, averageAiScore, nextStep: "competitor_discovery" },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: competitor_discovery (discover competitor domains from SERP or heuristic signals)
    if (step === "competitor_discovery") {
      await auditorLog({ supabase, scanId, companyId, message: "competitor_discovery:start" })
      const competitors = await discoverCompetitors({
        supabase,
        scanId,
        targetHost: hostLock,
      })

      const { error: competitorDiscoveryError } = await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_admin: {
            ...toRecord(lockedScan.report_admin),
            competitors_count: competitors.length,
          },
          step: "competitor_crawl",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      if (competitorDiscoveryError) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "competitor_discovery:update_failed",
          data: { message: competitorDiscoveryError.message, code: competitorDiscoveryError.code },
        })
        throw new Error(`competitor_discovery update failed: ${competitorDiscoveryError.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "competitor_discovery:done",
        data: { competitorsCount: competitors.length },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: competitor_crawl (fetch bounded competitor pages)
    if (step === "competitor_crawl") {
      await auditorLog({ supabase, scanId, companyId, message: "competitor_crawl:start" })
      const crawled = await crawlCompetitorPages({ supabase, scanId })

      const { error: competitorCrawlError } = await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_admin: {
            ...toRecord(lockedScan.report_admin),
            competitor_pages_count: crawled.length,
          },
          step: "competitor_keywords",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      if (competitorCrawlError) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "competitor_crawl:update_failed",
          data: { message: competitorCrawlError.message, code: competitorCrawlError.code },
        })
        throw new Error(`competitor_crawl update failed: ${competitorCrawlError.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "competitor_crawl:done",
        data: { pagesCount: crawled.length },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: competitor_keywords (extract competitor keyword sets)
    if (step === "competitor_keywords") {
      await auditorLog({ supabase, scanId, companyId, message: "competitor_keywords:start" })
      const result = await extractCompetitorKeywords({ supabase, scanId })

      const { error: competitorKeywordsError } = await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_admin: {
            ...toRecord(lockedScan.report_admin),
            competitor_keywords_count: result.keywordsCount,
          },
          step: "content_gap_analysis",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      if (competitorKeywordsError) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "competitor_keywords:update_failed",
          data: { message: competitorKeywordsError.message, code: competitorKeywordsError.code },
        })
        throw new Error(`competitor_keywords update failed: ${competitorKeywordsError.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "competitor_keywords:done",
        data: result,
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: content_gap_analysis (compare competitor keywords to target coverage)
    if (step === "content_gap_analysis") {
      await auditorLog({ supabase, scanId, companyId, message: "content_gap_analysis:start" })
      const gaps = await analyzeContentGaps({ supabase, scanId })

      const { error: gapUpdateError } = await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_public: {
            ...toRecord(lockedScan.report_public),
            content_gaps_count: gaps.length,
          },
          report_admin: {
            ...toRecord(lockedScan.report_admin),
            content_gaps_count: gaps.length,
            top_content_gaps: gaps.slice(0, 5).map((gap) => gap.keyword),
          },
          step: "recommendations",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )
      if (gapUpdateError) {
        await auditorLog({
          supabase,
          scanId,
          companyId,
          level: "error",
          message: "content_gap_analysis:update_failed",
          data: { message: gapUpdateError.message, code: gapUpdateError.code },
        })
        throw new Error(`content_gap_analysis update failed: ${gapUpdateError.message}`)
      }

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "content_gap_analysis:done",
        data: { gapsCount: gaps.length },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: recommendations (persist action plan from analysis outputs)
    if (step === "recommendations") {
      await auditorLog({ supabase, scanId, companyId, message: "recommendations:start" })
      const recommendations = await generateRecommendations({ supabase, scanId })
      const currentPublicReport = toRecord(lockedScan.report_public)
      const currentAdminReport = toRecord(lockedScan.report_admin)

      await applyScanWhere(
        supabase.from("auditor_scans").update({
          report_public: {
            ...currentPublicReport,
            recommendations_count: recommendations.length,
            top_recommendations: recommendations.map((item) => item.title).slice(0, 5),
          },
          report_admin: {
            ...currentAdminReport,
            recommendations_count: recommendations.length,
            top_recommendations: recommendations.map((item) => item.title).slice(0, 5),
          },
          step: "persist",
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({
        supabase,
        scanId,
        companyId,
        message: "recommendations:done",
        data: { recommendationsCount: recommendations.length },
      })
      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: persist (finalize scan)
    if (step === "persist") {
      await auditorLog({ supabase, scanId, companyId, message: "persist:start" })
      await applyScanWhere(
        supabase.from("auditor_scans").update({
          status: "done",
          step: "done",
          finished_at: nowIso(),
          updated_at: nowIso(),
        }),
        scanId,
        companyId
      )

      await auditorLog({ supabase, scanId, companyId, message: "persist:done" })
      await auditorLog({ supabase, scanId, companyId, message: "scan:done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // done/unknown state: no-op
    await releaseLock()
    const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
    return { ok: true, kind: "progressed", scan }
  } catch (e: any) {
    const msg = String(e?.message || e)
    console.error("[auditor] scan error", { scanId: params.scanId, message: msg })
    await auditorLog({ supabase, scanId: params.scanId, companyId: params.companyId ?? null, level: "error", message: "scan:failed", data: { error: msg } })
    const { error: failUpdateError } = await applyScanWhere(
      supabase.from("auditor_scans").update({
        status: "failed",
        last_error: msg.slice(0, 500),
        finished_at: nowIso(),
        locked_at: null,
        locked_by: null,
        updated_at: nowIso(),
      }),
      params.scanId,
      params.companyId
    )
    if (failUpdateError) {
      console.error("[auditor] failed-state update error", {
        scanId: params.scanId,
        message: failUpdateError.message,
        code: failUpdateError.code,
      })
    }
    return { ok: false, kind: "invalid_state", message: msg }
  }
}

