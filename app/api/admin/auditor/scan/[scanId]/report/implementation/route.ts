export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { loadReportData } from "@/lib/auditor/reports/data-loader"
import { buildImplementationBrief } from "@/lib/auditor/reports/implementation-brief"

export async function GET(req: Request, ctx: { params: { scanId: string } }) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const scanId = ctx.params.scanId
  if (!scanId || typeof scanId !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid scanId" }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  let data
  try {
    data = await loadReportData({ supabase, scanId })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Failed to load scan data: ${String(e?.message || e).slice(0, 300)}` },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Scan not found" }, { status: 404 })
  }

  if (data.scan.status !== "done") {
    return NextResponse.json(
      { ok: false, error: `Scan not finished yet (status=${data.scan.status})` },
      { status: 409 }
    )
  }

  // Allow ?inline=true to view in browser instead of download.
  const url = new URL(req.url)
  const inline = url.searchParams.get("inline") === "true"

  const markdown = buildImplementationBrief(data)
  const safeHost = (data.scan.normalized_host || data.scan.hostname || "site")
    .replace(/[^a-z0-9-]/gi, "_")
    .toLowerCase()
  const filename = `implementation-brief-${safeHost}-${data.scan.id.slice(0, 8)}.md`

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": inline ? `inline` : `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  })
}
