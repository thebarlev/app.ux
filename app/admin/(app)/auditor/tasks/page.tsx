import { createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorTasksTable } from "@/components/admin/auditor/AdminAuditorTasksTable"
import { resolveTask, closeTask } from "./actions"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

export const dynamic = "force-dynamic"

const STATUS_TABS = ["open", "in_progress", "fixed", "wont_fix"] as const

export default async function AdminAuditorTasksPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const admin = createServiceRoleClient()
  const statusFilter = searchParams.status ?? "open"

  const { data: tasksRaw, error } = await admin
    .from("auditor_tasks")
    .select("id,scan_id,rule_key,status,assigned_to,notes,created_at,updated_at,auditor_scans(hostname,normalized_host)")
    .eq("status", statusFilter)
    .order("updated_at", { ascending: false })
    .limit(50)

  const tasks = (tasksRaw ?? []).map((t: any) => ({
    ...t,
    hostname: t.auditor_scans?.hostname ?? t.auditor_scans?.normalized_host ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Task Management</h1>
        <p className="mt-1 text-slate-500">Manage remediation tasks generated from scan findings.</p>
        {error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error: {error.message}
          </div>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <Link
            key={s}
            href={`/admin/auditor/tasks?status=${s}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <AdminAuditorTasksTable
        tasks={tasks as any}
        onResolve={resolveTask}
        onClose={closeTask}
      />
    </div>
  )
}
