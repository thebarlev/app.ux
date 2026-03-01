export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"

export async function POST(_: Request, ctx: { params: Promise<{ scanId: string }> }) {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const { scanId } = await ctx.params
  const res = await continueAuditorScan({ scanId, companyId: access.companyId })

  if (!res.ok && res.kind === "busy") {
    return NextResponse.json({ ok: false, error: "scan is busy" }, { status: 409 })
  }
  if (!res.ok) {
    const message = "message" in res ? String((res as any).message) : res.kind
    const status = res.kind === "not_found" ? 404 : res.kind === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  return NextResponse.json({ ok: true, scan: res.scan })
}

