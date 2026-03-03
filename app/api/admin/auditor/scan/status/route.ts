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
    .select("id,status,step,normalized_host,created_at,finished_at,updated_at,report_public,report_admin,artifacts")
    .eq("id", parsed.data.scanId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error || !scan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  const reportPublic = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const reportAdmin = scan.report_admin && typeof scan.report_admin === "object" ? scan.report_admin : {}
  const artifacts = scan.artifacts && typeof scan.artifacts === "object" ? scan.artifacts : {}
  const screenshotUrlRaw = typeof (artifacts as any).screenshot_url === "string" ? (artifacts as any).screenshot_url : null
  const screenshot_url = screenshotUrlRaw && String(screenshotUrlRaw).startsWith("/auditor-screenshots/") ? screenshotUrlRaw : null

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
    score_total: reportPublic?.score_total ?? null,
    score_search: reportPublic?.score_search ?? null,
    score_ai: reportPublic?.score_ai ?? null,
  })
}
