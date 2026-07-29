import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Adopt the anonymous scan someone ran before signing up, and start the full one.
 *
 * The landing page creates a verification scan through /api/auditor/pre-scan
 * with company_id null — it has to, since there is no account yet. The dashboard
 * only ever queries scans by company_id, so until something claims that row the
 * visitor registers and lands on an empty dashboard. Nothing claimed it: the one
 * function that could, /api/auditor/admin/link-lead-to-company, is an admin tool
 * that wants a leadId and a billing tier and sets up recurring schedules, none of
 * which exist at signup.
 *
 * So the quick scan is adopted here, and a full one is queued alongside it. Both
 * carry the company id, and the dashboard shows whichever finished last — the
 * verification result within seconds, replaced by the full report when it lands.
 *
 * Safe to call more than once. Linking filters on company_id being null, and the
 * full scan is only created when the company has no other scan for that host, so
 * a repeated bootstrap call is a no-op rather than a duplicate.
 */
export async function attachScanToCompany(params: {
  admin: SupabaseClient
  companyId: string
  userId: string
  /** Preferred: the exact scan the visitor watched on the landing page. */
  scanId?: string | null
  /** Fallback when the landing page did not hand the id through registration. */
  website?: string | null
}): Promise<{
  linkedScanId: string | null
  fullScanId: string | null
  normalizedHost: string | null
  reason: string
}> {
  const { admin, companyId, userId } = params
  const scanId = String(params.scanId || "").trim()

  const hostFromWebsite = (() => {
    const raw = String(params.website || "").trim()
    if (!raw) return null
    try {
      return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.trim().toLowerCase() || null
    } catch {
      return null
    }
  })()

  // Prefer the scan the visitor actually saw. Only adopt it if it is still
  // unclaimed, so one person's scan can never be pulled into another's company.
  let candidate: any = null
  if (scanId) {
    const { data } = await admin
      .from("auditor_scans")
      .select("id,normalized_host,normalized_url,target_url,page_limit")
      .eq("id", scanId)
      .is("company_id", null)
      .maybeSingle()
    if (data) candidate = data
  }

  // Otherwise the most recent unclaimed scan for the site they registered with.
  if (!candidate && hostFromWebsite) {
    const { data } = await admin
      .from("auditor_scans")
      .select("id,normalized_host,normalized_url,target_url,page_limit")
      .is("company_id", null)
      .eq("normalized_host", hostFromWebsite)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) candidate = data
  }

  if (!candidate) {
    return { linkedScanId: null, fullScanId: null, normalizedHost: hostFromWebsite, reason: "no_anonymous_scan_found" }
  }

  const normalizedHost = String(candidate.normalized_host || hostFromWebsite || "").trim().toLowerCase() || null

  const { data: linked } = await admin
    .from("auditor_scans")
    .update({ company_id: companyId, created_by_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .is("company_id", null)
    .select("id")
    .maybeSingle()

  const linkedScanId = linked?.id ? String(linked.id) : null

  // Already has a full scan for this host — a second bootstrap call must not
  // queue another one.
  if (normalizedHost) {
    const { data: existingFull } = await admin
      .from("auditor_scans")
      .select("id")
      .eq("company_id", companyId)
      .eq("normalized_host", normalizedHost)
      .neq("scan_kind", "verification")
      .limit(1)
      .maybeSingle()
    if (existingFull?.id) {
      return { linkedScanId, fullScanId: String(existingFull.id), normalizedHost, reason: "full_scan_already_exists" }
    }
  }

  // scan_kind is left unset on purpose: the pipeline treats anything that is not
  // "verification" as a full scan, which is the whole 18-step chain.
  const { data: fullScan } = await admin
    .from("auditor_scans")
    .insert({
      company_id: companyId,
      created_by_user_id: userId,
      created_by_role: "customer",
      status: "queued",
      step: "normalize",
      target_url: candidate.target_url,
      normalized_url: candidate.normalized_url,
      normalized_host: normalizedHost,
      hostname: normalizedHost,
      page_limit: 10,
      artifacts: {},
      coverage: {},
      confidence: {},
      score_breakdown: {},
      report_public: {},
      report_admin: {},
    } as any)
    .select("id")
    .maybeSingle()

  return {
    linkedScanId,
    fullScanId: fullScan?.id ? String(fullScan.id) : null,
    normalizedHost,
    reason: linkedScanId ? "linked_and_queued_full" : "already_linked_queued_full",
  }
}
