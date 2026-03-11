import { createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorScanViewer } from "@/components/admin/auditor/AdminAuditorScanViewer"
import { createTaskFromFinding } from "../../tasks/actions"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AdminAuditorScanDetailPage({
  params,
}: {
  params: { scanId: string }
}) {
  const admin = createServiceRoleClient()
  const { scanId } = params

  const { data: scan, error: scanErr } = await admin.from("auditor_scans").select("*").eq("id", scanId).single()

  if (scanErr || !scan) return notFound()

  const pageLimit = Number.isFinite(Number(scan.page_limit)) ? Math.max(1, Number(scan.page_limit)) : 20

  const [
    { data: pages },
    { data: keywords },
    { data: topics },
    { data: competitors },
    { data: contentGaps },
    { data: rules },
    { data: recommendations },
    { data: findings },
    { data: logs },
  ] = await Promise.all([
    admin.from("auditor_scan_pages")
      .select("id,url,state,status_code,title,content_bytes,fetch_ms,error,meta_description,canonical,lang,has_og,has_twitter,jsonld_types,tracking,analysis")
      .eq("scan_id", scanId)
      .order("created_at")
      .limit(pageLimit),
    admin.from("auditor_keywords")
      .select("id,keyword,keyword_type,confidence")
      .eq("scan_id", scanId)
      .order("confidence", { ascending: false })
      .limit(200),
    admin.from("auditor_topics")
      .select("id,topic,coverage_score,missing_pages")
      .eq("scan_id", scanId)
      .order("coverage_score", { ascending: false })
      .limit(50),
    admin.from("auditor_competitors")
      .select("id,domain,source,confidence")
      .eq("scan_id", scanId)
      .order("confidence", { ascending: false })
      .limit(20),
    admin.from("auditor_content_gaps")
      .select("id,keyword,topic,priority,competitor_count")
      .eq("scan_id", scanId)
      .order("competitor_count", { ascending: false })
      .limit(50),
    admin.from("auditor_scan_rules")
      .select("id,rule_key,category,status,impact,effort,weight,recommendation_he,evidence")
      .eq("scan_id", scanId)
      .order("status"),
    admin.from("auditor_recommendations")
      .select("id,priority,title,description,action")
      .eq("scan_id", scanId)
      .order("priority", { ascending: false })
      .limit(50),
    admin.from("auditor_scan_findings")
      .select("id,rule_key,severity,status,scope,url,title,summary,recommendation,evidence")
      .eq("scan_id", scanId)
      .order("severity"),
    admin.from("auditor_scan_logs")
      .select("ts,level,message,data")
      .eq("scan_id", scanId)
      .order("ts", { ascending: true })
      .limit(500),
  ])

  const scanOverview = {
    id: scan.id,
    hostname: scan.hostname ?? scan.normalized_host ?? null,
    target_url: scan.target_url ?? "",
    status: scan.status,
    step: scan.step,
    scan_kind: scan.scan_kind,
    created_by_role: scan.created_by_role ?? "customer",
    page_limit: pageLimit,
    score_total: scan.score_total ?? null,
    score_breakdown: (scan.score_breakdown as Record<string, unknown>) ?? {},
    report_public: (scan.report_public as Record<string, unknown>) ?? {},
    report_admin: (scan.report_admin as Record<string, unknown>) ?? {},
    created_at: scan.created_at,
    started_at: scan.started_at ?? null,
    finished_at: scan.finished_at ?? null,
    lead_email_normalized: scan.lead_email_normalized ?? null,
    attempts: scan.attempts ?? 0,
    last_error: scan.last_error ?? scan.error ?? null,
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/auditor/scans"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />Back to scans
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{scan.hostname ?? scan.target_url ?? scanId}</h1>
        <p className="mt-0.5 font-mono text-xs text-slate-400">{scanId}</p>
      </div>

      <AdminAuditorScanViewer
        scan={scanOverview}
        pages={(pages ?? []) as any}
        keywords={(keywords ?? []) as any}
        topics={(topics ?? []) as any}
        competitors={(competitors ?? []) as any}
        contentGaps={(contentGaps ?? []) as any}
        rules={(rules ?? []) as any}
        recommendations={(recommendations ?? []) as any}
        findings={(findings ?? []) as any}
        logs={(logs ?? []) as any}
        onCreateTask={createTaskFromFinding}
      />
    </div>
  )
}
