import { createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorMetrics, type AuditorMetrics } from "@/components/admin/auditor/AdminAuditorMetrics"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

export const dynamic = "force-dynamic"

const STATUS_COLORS: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  running: "bg-blue-100 text-blue-700",
  queued: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
}

export default async function AdminAuditorDashboardPage() {
  const admin = createServiceRoleClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { count: scansToday },
    { count: scansTotal },
    { count: running },
    { count: failedToday },
    { count: doneToday },
    { data: avgData },
    { data: recentScans },
  ] = await Promise.all([
    admin.from("auditor_scans").select("*", { count: "exact", head: true }).gte("created_at", today),
    admin.from("auditor_scans").select("*", { count: "exact", head: true }),
    admin.from("auditor_scans").select("*", { count: "exact", head: true }).eq("status", "running"),
    admin.from("auditor_scans").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", today),
    admin.from("auditor_scans").select("*", { count: "exact", head: true }).eq("status", "done").gte("created_at", today),
    admin.from("auditor_scans").select("score_total").eq("status", "done").not("score_total", "is", null).limit(200),
    admin.from("auditor_scans")
      .select("id,hostname,status,step,score_total,created_at,scan_kind")
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  const avgScore =
    avgData && avgData.length > 0
      ? avgData.reduce((acc: number, row: any) => acc + (row.score_total ?? 0), 0) / avgData.length
      : null

  const metrics: AuditorMetrics = {
    scansToday: scansToday ?? 0,
    scansTotal: scansTotal ?? 0,
    running: running ?? 0,
    failed: failedToday ?? 0,
    done: doneToday ?? 0,
    avgScoreTotal: avgScore,
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditor Admin Dashboard</h1>
        <p className="mt-1 text-slate-500">
          Monitor AI &amp; SEO audit pipeline — scans, rules, tasks, and billing.
        </p>
      </div>

      <AdminAuditorMetrics metrics={metrics} />

      {/* Recent scans */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Recent Scans</h2>
          <Link href="/admin/auditor/scans" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            View all <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Host</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Step</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Score</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(recentScans ?? []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No scans yet</td></tr>
              ) : (recentScans ?? []).map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.hostname ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-500"}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.step}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-slate-700">{s.score_total ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">
                    {new Date(s.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/auditor/scans/${s.id}`} className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
