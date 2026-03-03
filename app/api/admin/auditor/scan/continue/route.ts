export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"

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
  const res = await continueAuditorScan({
    scanId: parsed.data.scanId,
    companyId,
    supabase: admin,
  })

  if (res.ok && res.kind === "progressed") {
    return NextResponse.json({
      ok: true,
      kind: res.kind,
      status: res.scan?.status,
      step: res.scan?.step,
    })
  }

  if (res.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  if (res.kind === "busy") {
    return NextResponse.json({ ok: false, error: "Scan busy" }, { status: 409 })
  }

  return NextResponse.json({
    ok: false,
    error: res.message || "Invalid state",
  }, { status: 400 })
}
