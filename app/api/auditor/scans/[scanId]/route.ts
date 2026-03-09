export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"

export async function GET(_: Request, ctx: { params: Promise<{ scanId: string }> }) {
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

  if (error) return NextResponse.json({ ok: false, error: "Failed to load scan" }, { status: 500 })
  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  // Admin-only: score_breakdown (technical, schema, tracking) — do not expose to end user
  const { score_breakdown: _sb, ...scanPublic } = scan as { score_breakdown?: unknown; [k: string]: unknown }

  const [{ data: rulesRaw }, { data: pages }, { data: logs }] = await Promise.all([
    supabase
      .from("auditor_scan_rules")
      .select("rule_key,category,weight,status,impact,effort,evidence,recommendation_he,created_at")
      .eq("scan_id", scanId)
      .eq("company_id", access.companyId)
      .order("category", { ascending: true }),
    supabase
      .from("auditor_scan_pages")
      .select("url,path,state,status_code,content_type,fetch_ms,title,meta_description,canonical,lang,dir,has_og,has_twitter,jsonld_types,tracking,error")
      .eq("scan_id", scanId)
      .eq("company_id", access.companyId)
      .order("url", { ascending: true }),
    supabase
      .from("auditor_scan_logs")
      .select("ts,level,message,data")
      .eq("scan_id", scanId)
      .eq("company_id", access.companyId)
      .order("ts", { ascending: false })
      .limit(200),
  ])

  // Fallback: when rules table is empty but report_public has issues_overview (e.g. rules written, timing gap),
  // build synthetic rules so UI can show Priorities.
  let rules = rulesRaw || []
  if (rules.length === 0) {
    const rp = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
    const issues = Array.isArray((rp as any).issues_overview) ? (rp as any).issues_overview : []
    if (issues.length > 0) {
      rules = issues.slice(0, 12).map((text: string, i: number) => ({
        rule_key: `issue_${i}`,
        category: "technical",
        weight: 10,
        status: "warn",
        impact: "medium",
        effort: "low",
        evidence: null,
        recommendation_he: String(text),
        created_at: null,
      }))
    }
  }

  return NextResponse.json({
    ok: true,
    scan: scanPublic,
    rules,
    pages: pages || [],
    logs: logs ? [...logs].reverse() : [],
  })
}

