export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { RULE_KEY_TO_EN } from "@/lib/auditor/report/public"

const querySchema = z.object({
  scanId: z.string().min(1),
  token: z.string().min(1),
  locale: z.enum(["he", "en"]).optional(),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

export async function GET(req: Request) {
  try {
    const nf = notFoundIfDisabled()
    if (nf) return nf

    const url = new URL(req.url)
    const parsed = querySchema.safeParse({
      scanId: url.searchParams.get("scanId"),
      token: url.searchParams.get("token"),
      locale: url.searchParams.get("locale") || undefined,
    })
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 })

    const admin = createServiceRoleClient()
    const { data: scan, error: queryError } = await admin
      .from("auditor_scans")
      .select("id,status,step,score_total,report_public,confidence,updated_at,finished_at,scan_access_token,artifacts,normalized_host")
      .eq("id", parsed.data.scanId)
      .maybeSingle()

    if (queryError) {
      console.error("[AUDITOR_STATUS] Supabase query error", { scanId: parsed.data.scanId, error: queryError })
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 })
    }
    if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  if (String(scan.scan_access_token || "") !== parsed.data.token) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const { count: pagesScanned } = await admin
    .from("auditor_scan_pages")
    .select("id", { count: "exact", head: true })
    .eq("scan_id", parsed.data.scanId)

  const publicReport = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const confidence = scan.confidence && typeof scan.confidence === "object" ? scan.confidence : {}
  const artifacts = scan.artifacts && typeof scan.artifacts === "object" ? scan.artifacts : {}

  const screenshotUrlRaw = typeof (artifacts as any).screenshot_url === "string" ? String((artifacts as any).screenshot_url) : null
  const screenshot_url =
    screenshotUrlRaw &&
    (screenshotUrlRaw.startsWith("/auditor-screenshots/") || screenshotUrlRaw.startsWith("https://"))
      ? screenshotUrlRaw
      : null

  const useEn = parsed.data.locale === "en"

  // Allowlist sanitizer to ensure report_public never leaks identifiers even if DB contains extra keys.
  let issuesOverview = Array.isArray((publicReport as any).issues_overview)
    ? (publicReport as any).issues_overview.map((x: any) => String(x)).slice(0, 12)
    : []
  let issuesOverviewEn = Array.isArray((publicReport as any).issues_overview_en)
    ? (publicReport as any).issues_overview_en.map((x: any) => String(x)).slice(0, 12)
    : []

  // Fallback: when report_public has no issues but step is rules/persist, rules may exist in auditor_scan_rules
  // (e.g. rules stage wrote rules but scan update failed, or timing gap). Build issues from rules.
  if (issuesOverview.length === 0 && (scan.step === "rules" || scan.step === "persist")) {
    const { data: rules } = await admin
      .from("auditor_scan_rules")
      .select("status,recommendation_he,rule_key")
      .eq("scan_id", parsed.data.scanId)
    const fromRules = Array.isArray(rules)
      ? rules
          .filter((r) => r.status === "fail" || r.status === "warn")
          .map((r) => String(r.recommendation_he || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : []
    const fromRulesEn = Array.isArray(rules)
      ? rules
          .filter((r) => r.status === "fail" || r.status === "warn")
          .map((r) => RULE_KEY_TO_EN[(r as any).rule_key])
          .filter(Boolean)
          .slice(0, 12)
      : []
    if (fromRules.length > 0) {
      issuesOverview = fromRules
      if (fromRulesEn.length > 0) issuesOverviewEn = fromRulesEn
    }
  }

  const effectiveIssues = useEn && issuesOverviewEn.length > 0 ? issuesOverviewEn : issuesOverview

  const safeReportPublic = {
    score_total: typeof (publicReport as any).score_total === "number" ? (publicReport as any).score_total : null,
    score_search: typeof (publicReport as any).score_search === "number" ? (publicReport as any).score_search : null,
    score_ai: typeof (publicReport as any).score_ai === "number" ? (publicReport as any).score_ai : null,
    category_scores: (publicReport as any).category_scores && typeof (publicReport as any).category_scores === "object" ? (publicReport as any).category_scores : {},
    issues_overview: effectiveIssues,
    confidence_level:
      (publicReport as any).confidence_level === "high" || (publicReport as any).confidence_level === "medium" || (publicReport as any).confidence_level === "low"
        ? (publicReport as any).confidence_level
        : null,
    warning: typeof (publicReport as any).warning === "string" ? String((publicReport as any).warning).slice(0, 140) : null,
  } as const

    // SECURITY: do not leak any technical identifiers; only return the public shape.
    return NextResponse.json(
      {
        ok: true,
        status: scan.status,
        step: scan.step,
        screenshot_url,
        score_total: safeReportPublic.score_total ?? scan.score_total ?? null,
        score_search: safeReportPublic.score_search,
        score_ai: safeReportPublic.score_ai,
        category_scores: safeReportPublic.category_scores,
        issues_overview: safeReportPublic.issues_overview,
        confidence_level: safeReportPublic.confidence_level ?? (confidence as any).level ?? null,
        warning: safeReportPublic.warning ?? (confidence as any).warning ?? null,
        done: scan.status === "done" || scan.status === "failed",
        report_public: scan.status === "done" ? safeReportPublic : null,
        updated_at: scan.updated_at,
        finished_at: scan.finished_at,
        hostname: typeof (scan as any).normalized_host === "string" ? (scan as any).normalized_host : null,
        pages_scanned: typeof pagesScanned === "number" ? pagesScanned : null,
        issues_count: effectiveIssues.length,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    )
  } catch (e: any) {
    console.error("[AUDITOR_STATUS] Unhandled error", { error: e?.message, stack: e?.stack })
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
}

