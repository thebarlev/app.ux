export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"

const MAX_ITERATIONS = 50
const EXPAND_BY = 20

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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const staleBefore = new Date(Date.now() - 30_000).toISOString()

  const { data: scan, error } = await admin
    .from("auditor_scans")
    .select("id,status,step,page_limit,locked_at,company_id")
    .eq("id", parsed.data.scanId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error || !scan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  if (scan.locked_at && String(scan.status || "") === "running" && String(scan.locked_at) >= staleBefore) {
    return NextResponse.json({ ok: false, error: "Scan busy" }, { status: 409 })
  }

  const currentPageLimit = Number.isFinite(Number(scan.page_limit)) ? Math.max(1, Number(scan.page_limit)) : 20
  const nextPageLimit = currentPageLimit + EXPAND_BY

  const resetPatch =
    scan.status === "done" || scan.status === "failed"
      ? {
          status: "queued",
          step: "sample",
          finished_at: null,
          last_error: null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }
      : {
          updated_at: new Date().toISOString(),
        }

  const { error: updateError } = await admin
    .from("auditor_scans")
    .update({
      page_limit: nextPageLimit,
      ...resetPatch,
    })
    .eq("id", scan.id)
    .eq("company_id", companyId)

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Failed to expand scan" }, { status: 500 })
  }

  let result: Awaited<ReturnType<typeof continueAuditorScan>> = { ok: false, kind: "not_found" }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    result = await continueAuditorScan({
      scanId: scan.id,
      companyId,
      supabase: admin,
    })

    if (!result.ok && result.kind === "busy") {
      return NextResponse.json({ ok: false, error: "Scan busy" }, { status: 409 })
    }
    if (!result.ok) {
      const message = "message" in result ? String((result as any).message) : result.kind
      const status = result.kind === "not_found" ? 404 : result.kind === "forbidden" ? 403 : 400
      return NextResponse.json({ ok: false, error: message }, { status })
    }

    const currentScan = result.scan || {}
    if (currentScan.status === "done" || currentScan.status === "failed") break
  }

  return NextResponse.json({
    ok: true,
    pageLimit: nextPageLimit,
    scan: "scan" in result ? result.scan : null,
  })
}
