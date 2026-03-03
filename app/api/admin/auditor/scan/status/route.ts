export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"

const querySchema = z.object({
  scanId: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  let companyId: string
  try {
    companyId = getAdminAuditorCompanyId()
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ scanId: url.searchParams.get("scanId") })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid scanId" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: scan, error } = await admin
    .from("auditor_scans")
    .select("id,status,step,normalized_host,created_at,finished_at,updated_at,report_public,report_admin,score_breakdown,artifacts")
    .eq("id", parsed.data.scanId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error || !scan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  let rules: unknown[] = []
  let pages: unknown[] = []
  let logs: unknown[] = []
  if (scan.status === "done" || scan.status === "failed") {
    const [rulesRes, pagesRes, logsRes] = await Promise.all([
      admin.from("auditor_scan_rules").select("rule_key,category,weight,status,impact,effort,evidence,recommendation_he").eq("scan_id", scan.id).eq("company_id", companyId).order("category"),
      admin.from("auditor_scan_pages").select("url,path,state,status_code,title,meta_description,canonical,tracking,error").eq("scan_id", scan.id).eq("company_id", companyId).order("url"),
      admin.from("auditor_scan_logs").select("ts,level,message,data").eq("scan_id", scan.id).eq("company_id", companyId).order("ts", { ascending: false }).limit(100),
    ])
    rules = rulesRes.data || []
    pages = pagesRes.data || []
    logs = (logsRes.data || []).reverse()
  }

  const reportPublic = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const reportAdmin = scan.report_admin && typeof scan.report_admin === "object" ? scan.report_admin : {}
  const artifacts = scan.artifacts && typeof scan.artifacts === "object" ? scan.artifacts : {}
  const screenshotUrlRaw = typeof (artifacts as any).screenshot_url === "string" ? (artifacts as any).screenshot_url : null
  const screenshot_url = screenshotUrlRaw && String(screenshotUrlRaw).startsWith("/auditor-screenshots/") ? screenshotUrlRaw : null

  const scoreBreakdown = scan.score_breakdown && typeof scan.score_breakdown === "object" ? scan.score_breakdown : null

  return NextResponse.json({
    ok: true,
    scanId: scan.id,
    status: scan.status,
    step: scan.step,
    normalized_host: scan.normalized_host,
    created_at: scan.created_at,
    updated_at: scan.updated_at,
    finished_at: scan.finished_at,
    screenshot_url,
    report_public: scan.status === "done" ? reportPublic : null,
    report_admin: reportAdmin,
    score_breakdown: scoreBreakdown,
    score_total: reportPublic?.score_total ?? null,
    score_search: reportPublic?.score_search ?? null,
    score_ai: reportPublic?.score_ai ?? null,
    rules,
    pages,
    logs,
  })
}
