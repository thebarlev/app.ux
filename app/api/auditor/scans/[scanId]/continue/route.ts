export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"
import { computeProgress } from "@/lib/auditor/pipeline/progress"
import { createServiceRoleClient } from "@/lib/supabase/server"

const BUDGET_MS = 5_000

export async function POST(_: Request, ctx: { params: Promise<{ scanId: string }> }) {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const { scanId } = await ctx.params
  const admin = createServiceRoleClient()
  const started = Date.now()

  let res: Awaited<ReturnType<typeof continueAuditorScan>> = { ok: false, kind: "not_found" }

  while (Date.now() - started < BUDGET_MS) {
    res = await continueAuditorScan({
      scanId,
      companyId: access.companyId,
      supabase: admin,
      maxPagesPerBatch: 3,
    })

    if (!res.ok && res.kind === "busy") {
      return NextResponse.json({ ok: false, error: "scan is busy" }, { status: 409 })
    }
    if (!res.ok) {
      const message = "message" in res ? String((res as any).message) : res.kind
      const status = res.kind === "not_found" ? 404 : res.kind === "forbidden" ? 403 : 500
      return NextResponse.json({ ok: false, error: message }, { status })
    }

    const s = res.scan || {}
    if (s.status === "done" || s.status === "failed") break
  }

  const scan = "scan" in res ? res.scan : null
  const isDone = scan?.status === "done" || scan?.status === "failed"
  return NextResponse.json({
    ok: true,
    scan,
    partial: !isDone,
    progress: computeProgress(scan?.step),
  })
}
