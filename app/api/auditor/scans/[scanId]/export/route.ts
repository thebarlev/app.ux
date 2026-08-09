export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


export async function GET(_: Request, ctx: { params: Promise<{ scanId: string }> }) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (AUDITOR_BLOCKED) return new NextResponse(null, { status: 404 })

  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const { scanId } = await ctx.params
  const supabase = await createClient()

  const { data: scan, error } = await supabase
    .from("auditor_scans")
    .select("*")
    .eq("id", scanId)
    .eq("company_id", access.companyId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: "Failed to export" }, { status: 500 })
  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  const [{ data: rules }, { data: pages }, { data: logs }] = await Promise.all([
    supabase.from("auditor_scan_rules").select("*").eq("scan_id", scanId).eq("company_id", access.companyId),
    supabase.from("auditor_scan_pages").select("*").eq("scan_id", scanId).eq("company_id", access.companyId),
    supabase
      .from("auditor_scan_logs")
      .select("*")
      .eq("scan_id", scanId)
      .eq("company_id", access.companyId)
      .order("ts", { ascending: true })
      .limit(2000),
  ])

  return NextResponse.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    scan,
    rules: rules || [],
    pages: pages || [],
    logs: logs || [],
  })
}

