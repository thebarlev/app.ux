import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { auditorLog } from "../log"
import { fetchTextBounded } from "../fetch"
import { followRedirectsWithValidation, normalizeInputUrl } from "../ssrf"
import { parseSitemapXml } from "../sitemap"
import { pickSamplePages, shouldSkipByExtension } from "../sample"
import { extractFromHtml } from "../extract"
import { runRulesAndScore } from "../rules/runner"

type ContinueOk =
  | { ok: true; kind: "progressed"; scan: any }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "forbidden" | "invalid_state"; message: string }

function nowIso() {
  return new Date().toISOString()
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
  companyId: string
  requestId?: string
}): Promise<ContinueOk> {
  const supabase = await createClient()
  const requestId = params.requestId ?? randomUUID()
  const lockedAt = nowIso()
  const staleBefore = new Date(Date.now() - 30_000).toISOString()

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
    const { data, error } = await supabase
      .from("auditor_scans")
      .update(lockPatch)
      .eq("id", params.scanId)
      .eq("company_id", params.companyId)
      .in("status", ["queued", "running"])
      .is("locked_at", null)
      .select("*")
      .maybeSingle()

    if (error) {
      console.error("[auditor] lock acquisition error(A)", { message: error.message, code: error.code })
      return { ok: false, kind: "invalid_state", message: "lock_failed" }
    }
    lockedScan = data
  }

  // (B) Take over stale lock
  if (!lockedScan) {
    const { data, error } = await supabase
      .from("auditor_scans")
      .update(lockPatch)
      .eq("id", params.scanId)
      .eq("company_id", params.companyId)
      .in("status", ["queued", "running"])
      .lt("locked_at", staleBefore)
      .select("*")
      .maybeSingle()

    if (error) {
      console.error("[auditor] lock acquisition error(B)", { message: error.message, code: error.code })
      return { ok: false, kind: "invalid_state", message: "lock_failed" }
    }
    lockedScan = data
  }

  if (!lockedScan) return { ok: false, kind: "busy" }

  const scanId = String(lockedScan.id)
  const companyId = String(lockedScan.company_id)

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
      .eq("company_id", companyId)
      .eq("locked_by", requestId)
  }

  try {
    const step = String(lockedScan.step || "normalize")
    const artifacts = (lockedScan.artifacts || {}) as any
    const targetUrl = String(lockedScan.target_url || "")
    const normalizedUrl = lockedScan.normalized_url ? String(lockedScan.normalized_url) : null
    const hostname = lockedScan.hostname ? String(lockedScan.hostname) : null

    await auditorLog({ scanId, companyId, level: "debug", message: "continue:start", data: { step, requestId } })

    // Step: normalize
    if (step === "normalize") {
      const input = normalizeInputUrl(targetUrl)
      const { finalUrl, redirects } = await followRedirectsWithValidation({ startUrl: input, maxRedirects: 5, timeoutMs: 1500 })
      const origin = finalUrl.origin.replace(/\/+$/, "")

      await supabase
        .from("auditor_scans")
        .update({
          normalized_url: origin,
          hostname: finalUrl.hostname,
          started_at: lockedScan.started_at || nowIso(),
          step: "robots",
          artifacts: { ...artifacts, redirects },
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({
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

      await supabase
        .from("auditor_scans")
        .update({
          artifacts: nextArtifacts,
          step: "sitemap",
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({
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

        await supabase
          .from("auditor_scans")
          .update({ artifacts: nextArtifacts, updated_at: nowIso() })
          .eq("id", scanId)
          .eq("company_id", companyId)

        await auditorLog({
          scanId,
          companyId,
          message: "sitemap:primary_done",
          data: { sitemapUrl: primary, urlCount: acc.length, isIndex: childSitemaps.length > 0 },
        })

        // If not an index, we can advance immediately.
        if (childSitemaps.length === 0) {
          await supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
          await auditorLog({ scanId, companyId, message: "sitemap:done" })
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
        await supabase.from("auditor_scans").update({ artifacts: nextArtifacts, updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
        await auditorLog({ scanId, companyId, message: "sitemap:child_processed", data: { childIndex, childUrl, urlCount: acc.length } })

        // Advance when finished children or hit cap.
        const done = childIndex + 1 >= existingChild.length || acc.length >= cap
        if (done) {
          await supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
          await auditorLog({ scanId, companyId, message: "sitemap:done", data: { urlCount: acc.length } })
        }

        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      // Nothing left to do.
      await supabase.from("auditor_scans").update({ step: "ai_files", updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
      await auditorLog({ scanId, companyId, message: "sitemap:done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: ai_files
    if (step === "ai_files") {
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

      const nextArtifacts = {
        ...artifacts,
        ai_files: {
          llms_txt: pack(llms, llmsUrl),
          ai_json: pack(aiJson, aiJsonUrl),
          brand_json: pack(brand, brandUrl),
        },
      }

      await supabase
        .from("auditor_scans")
        .update({
          artifacts: nextArtifacts,
          step: "sample",
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({ scanId, companyId, message: "ai_files:done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: sample (insert queued pages)
    if (step === "sample") {
      const sitemapUrls: string[] = Array.isArray(artifacts?.sitemap?.urls) ? artifacts.sitemap.urls : []
      const sample = pickSamplePages({ origin, hostLock, sitemapUrls, maxPages: 20 })

      const rows = sample.map((u) => ({
        scan_id: scanId,
        company_id: companyId,
        url: u,
        path: safeUrlPath(u),
        state: "queued",
      }))

      if (rows.length > 0) {
        const { error } = await supabase.from("auditor_scan_pages").upsert(rows, { onConflict: "scan_id,url" })
        if (error) {
          await auditorLog({ scanId, companyId, level: "error", message: "sample:upsert_failed", data: { message: error.message } })
        }
      }

      const nextArtifacts = {
        ...artifacts,
        sample: { urls: sample, count: sample.length },
      }

      await supabase
        .from("auditor_scans")
        .update({
          artifacts: nextArtifacts,
          step: "fetch_pages",
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({ scanId, companyId, message: "sample:done", data: { count: sample.length } })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: fetch_pages (fetch one queued page per continue for time budget)
    if (step === "fetch_pages") {
      const { data: queuedPages } = await supabase
        .from("auditor_scan_pages")
        .select("id,url")
        .eq("scan_id", scanId)
        .eq("company_id", companyId)
        .eq("state", "queued")
        .limit(1)

      const pages = Array.isArray(queuedPages) ? queuedPages : []
      if (pages.length === 0) {
        await supabase.from("auditor_scans").update({ step: "extract", updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
        await auditorLog({ scanId, companyId, message: "fetch_pages:none_left" })
        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      await auditorLog({ scanId, companyId, message: "fetch_pages:start", data: { count: pages.length } })

      for (const p of pages) {
        const url = String((p as any).url)
        const res = await fetchTextBounded({
          url,
          timeoutMs: 1800,
          maxBytes: 250_000,
          headers: { "user-agent": "VOW-Auditor-POC/1.0" },
        })

        const contentType = res.ok ? res.contentType : null
        const isHtml = contentType ? contentType.toLowerCase().includes("text/html") : true

        if (res.ok && res.status >= 200 && res.status < 300 && isHtml) {
          await supabase
            .from("auditor_scan_pages")
            .update({
              state: "fetched",
              status_code: res.status,
              content_type: contentType,
              fetch_ms: res.elapsedMs,
              content_bytes: res.bytes,
              html: res.text,
              fetched_at: nowIso(),
            })
            .eq("id", (p as any).id)
            .eq("company_id", companyId)
        } else if (res.ok && res.status >= 200 && res.status < 300 && !isHtml) {
          await supabase
            .from("auditor_scan_pages")
            .update({
              state: "skipped",
              status_code: res.status,
              content_type: contentType,
              fetch_ms: res.elapsedMs,
              content_bytes: res.bytes,
              error: "non_html",
              fetched_at: nowIso(),
            })
            .eq("id", (p as any).id)
            .eq("company_id", companyId)
        } else {
          await supabase
            .from("auditor_scan_pages")
            .update({
              state: "failed",
              status_code: res.ok ? res.status : null,
              content_type: contentType,
              fetch_ms: res.elapsedMs,
              content_bytes: res.ok ? res.bytes : null,
              error: res.ok ? `http_${res.status}` : res.error,
              fetched_at: nowIso(),
            })
            .eq("id", (p as any).id)
            .eq("company_id", companyId)
        }
      }

      await auditorLog({ scanId, companyId, message: "fetch_pages:batch_done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: extract (extract up to 5 fetched pages)
    if (step === "extract") {
      const { data: fetchedPages } = await supabase
        .from("auditor_scan_pages")
        .select("id,url,path,html")
        .eq("scan_id", scanId)
        .eq("company_id", companyId)
        .eq("state", "fetched")
        .limit(5)

      const pages = Array.isArray(fetchedPages) ? fetchedPages : []
      if (pages.length === 0) {
        await supabase.from("auditor_scans").update({ step: "rules", updated_at: nowIso() }).eq("id", scanId).eq("company_id", companyId)
        await auditorLog({ scanId, companyId, message: "extract:none_left" })
        await releaseLock()
        const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
        return { ok: true, kind: "progressed", scan }
      }

      await auditorLog({ scanId, companyId, message: "extract:start", data: { count: pages.length } })

      for (const p of pages) {
        const html = String((p as any).html || "")
        const extracted = extractFromHtml(html)

        await supabase
          .from("auditor_scan_pages")
          .update({
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
            extracted_at: nowIso(),
          })
          .eq("id", (p as any).id)
          .eq("company_id", companyId)
      }

      await auditorLog({ scanId, companyId, message: "extract:batch_done" })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: rules (compute + persist rule rows + score)
    if (step === "rules") {
      const { data: pages } = await supabase
        .from("auditor_scan_pages")
        .select(
          "url,path,title,meta_description,canonical,lang,dir,has_og,has_twitter,jsonld_types,tracking"
        )
        .eq("scan_id", scanId)
        .eq("company_id", companyId)
        .eq("state", "extracted")
        .limit(50)

      const ctx = {
        scan: {
          target_url: targetUrl,
          normalized_url: origin,
          hostname: hostLock,
          artifacts: artifacts,
        },
        pages: (pages || []) as any[],
      }

      const { rules, scoreTotal, scoreBreakdown } = runRulesAndScore(ctx)

      await supabase.from("auditor_scan_rules").delete().eq("scan_id", scanId).eq("company_id", companyId)

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

      await supabase
        .from("auditor_scans")
        .update({
          score_total: scoreTotal,
          score_breakdown: scoreBreakdown,
          step: "persist",
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({ scanId, companyId, message: "rules:done", data: { scoreTotal, scoreBreakdown } })

      await releaseLock()
      const { data: scan } = await supabase.from("auditor_scans").select("*").eq("id", scanId).maybeSingle()
      return { ok: true, kind: "progressed", scan }
    }

    // Step: persist (finalize scan)
    if (step === "persist") {
      await supabase
        .from("auditor_scans")
        .update({
          status: "done",
          step: "done",
          finished_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", scanId)
        .eq("company_id", companyId)

      await auditorLog({ scanId, companyId, message: "scan:done" })

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
    console.error("[auditor] continue failed", { scanId: params.scanId, message: msg })
    await auditorLog({ scanId: params.scanId, companyId: params.companyId, level: "error", message: "scan:failed", data: { error: msg } })
    await supabase
      .from("auditor_scans")
      .update({
        status: "failed",
        error: msg.slice(0, 500),
        finished_at: nowIso(),
        locked_at: null,
        locked_by: null,
        updated_at: nowIso(),
      })
      .eq("id", params.scanId)
      .eq("company_id", params.companyId)
    return { ok: false, kind: "invalid_state", message: msg }
  }
}

