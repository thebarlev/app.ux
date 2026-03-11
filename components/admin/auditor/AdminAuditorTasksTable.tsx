"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

export interface TaskRow {
  id: string
  scan_id: string
  rule_key: string | null
  status: string
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
  hostname?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  fixed: "bg-emerald-100 text-emerald-700",
  wont_fix: "bg-slate-100 text-slate-500",
}

export function AdminAuditorTasksTable({
  tasks,
  onResolve,
  onClose,
}: {
  tasks: TaskRow[]
  onResolve: (taskId: string) => Promise<unknown>
  onClose: (taskId: string) => Promise<unknown>
}) {
  const [pending, startTransition] = useTransition()

  if (tasks.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No tasks found.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Scan</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Rule</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Assigned</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Updated</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-700">{task.hostname ?? <span className="text-slate-400">—</span>}</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{task.scan_id.slice(0, 8)}…</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{task.rule_key ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] ?? "bg-slate-100 text-slate-500"}`}>{task.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{task.assigned_to ? task.assigned_to.slice(0, 8) + "…" : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-slate-500">
                  {new Date(task.updated_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {(task.status === "open" || task.status === "in_progress") && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700"
                        disabled={pending}
                        onClick={() => startTransition(() => { onResolve(task.id) })}
                      >
                        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Resolve
                      </Button>
                    )}
                    {task.status !== "wont_fix" && task.status !== "fixed" && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700"
                        disabled={pending}
                        onClick={() => startTransition(() => { onClose(task.id) })}
                      >
                        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                        Won&apos;t Fix
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
