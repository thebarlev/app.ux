export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"
import { buildAdminReport } from "@/lib/auditor/report/admin"

const bodySchema = z.object({
  scanId: z.string().uuid(),
})

export async function POST(req: Request) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  let companyId: string
  try {
    companyId = getAdminAuditorCompanyId()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid scanId" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: scan, error: scanErr } = await admin
    .from("auditor_scans")
    .select("id,status,report_public,report_admin,score_breakdown,coverage,confidence")
    .eq("id", parsed.data.scanId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (scanErr || !scan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  if (scan.status !== "done") {
    return NextResponse.json({
      ok: false,
      error: "Scan must be done",
      reason: `status is '${scan.status}', expected 'done'`,
    }, { status: 400 })
  }

  const reportAdmin = scan.report_admin && typeof scan.report_admin === "object" ? scan.report_admin : {}
  const rulesInReport = Array.isArray(reportAdmin?.rules) ? reportAdmin.rules : []
  if (rulesInReport.length > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "report_admin.rules already populated",
      rulesCount: rulesInReport.length,
    })
  }

  const { data: rules } = await admin
    .from("auditor_scan_rules")
    .select("rule_key,category,status,impact,effort,recommendation_he,evidence")
    .eq("scan_id", scan.id)
    .eq("company_id", companyId)
    .order("category")

  const rulesArr = Array.isArray(rules) ? rules : []
  if (rulesArr.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Cannot backfill: no rules in auditor_scan_rules",
      reason: "auditor_scan_rules has no rows for this scan; report_admin cannot be built from empty rules",
    }, { status: 400 })
  }

  const reportPublic = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const scoreBreakdown = scan.score_breakdown && typeof scan.score_breakdown === "object" ? scan.score_breakdown : {}
  const coverage = scan.coverage && typeof scan.coverage === "object" ? scan.coverage : {}
  const confidence = scan.confidence && typeof scan.confidence === "object" ? scan.confidence : {}

  const totalPages = typeof coverage.total_pages === "number" ? coverage.total_pages : 0
  const extractedPages = typeof coverage.extracted_pages === "number" ? coverage.extracted_pages : 0
  const scoreTotal = typeof reportPublic.score_total === "number" ? reportPublic.score_total : 0
  const scoreSearch = typeof reportPublic.score_search === "number" ? reportPublic.score_search : 0
  const scoreAi = typeof reportPublic.score_ai === "number" ? reportPublic.score_ai : 0
  const confidenceLevel = typeof confidence.level === "string" ? confidence.level : "low"
  const warning = typeof confidence.warning === "string" ? confidence.warning : undefined

  const issuesOverview = rulesArr
    .filter((r) => r.status === "fail" || r.status === "warn")
    .map((r) => r.recommendation_he)
    .filter(Boolean)

  const adminReport = buildAdminReport({
    score_total: scoreTotal,
    score_search: scoreSearch,
    score_ai: scoreAi,
    score_breakdown: scoreBreakdown as Record<string, number>,
    category_scores: { search_readiness: scoreSearch, ai_readiness: scoreAi },
    rules: rulesArr.map((r) => ({
      rule_key: r.rule_key,
      category: r.category,
      status: r.status,
      impact: r.impact,
      effort: r.effort,
      recommendation_he: r.recommendation_he,
      evidence: r.evidence,
    })),
    total_pages: totalPages,
    extracted_pages: extractedPages,
    confidence_level: confidenceLevel,
    warning,
    issues_overview: issuesOverview.length > 0 ? issuesOverview : ["לא נמצאו בעיות מהותיות בבדיקה הראשונית."],
  })

  const { error: updateErr } = await admin
    .from("auditor_scans")
    .update({ report_admin: adminReport, updated_at: new Date().toISOString() })
    .eq("id", scan.id)
    .eq("company_id", companyId)

  if (updateErr) {
    return NextResponse.json({
      ok: false,
      error: "Update failed",
      reason: updateErr.message,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    backfilled: true,
    rulesCount: adminReport.rules.length,
  })
}
