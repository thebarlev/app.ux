"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, Loader2 } from "lucide-react"

export interface FindingRow {
  id: string
  rule_key: string
  severity: string
  status: string
  scope: string
  url: string | null
  title: string
  summary: string
  recommendation: string
  evidence?: Record<string, unknown>
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
}

export function AdminAuditorFindingsTable({
  findings,
  scanId,
  onCreateTask,
}: {
  findings: FindingRow[]
  scanId: string
  onCreateTask?: (findingId: string, scanId: string) => Promise<unknown>
}) {
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState<string | null>(null)

  const handleCreateTask = (findingId: string) => {
    if (!onCreateTask) return
    setCreating(findingId)
    startTransition(async () => {
      await onCreateTask(findingId, scanId)
      setCreating(null)
    })
  }

  if (findings.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No findings for this scan.</div>
  }

  return (
    <div className="space-y-3">
      {findings.map((f) => (
        <div key={f.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[f.severity] ?? "bg-slate-100 text-slate-500"}`}>{f.severity}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{f.scope}</span>
              <span className="font-mono text-xs text-slate-400">{f.rule_key}</span>
            </div>
            {onCreateTask && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1 text-xs h-7"
                onClick={() => handleCreateTask(f.id)}
                disabled={pending && creating === f.id}
              >
                {pending && creating === f.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <PlusCircle className="h-3 w-3" />
                }
                Create Task
              </Button>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-slate-800">{f.title}</h4>
            {f.url && <p className="mt-0.5 font-mono text-xs text-slate-400 break-all">{f.url}</p>}
          </div>

          <p className="text-sm text-slate-600">{f.summary}</p>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-600 mb-1">Recommendation</p>
            <p className="text-sm text-blue-800">{f.recommendation}</p>
          </div>

          {f.evidence && Object.keys(f.evidence).length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Evidence</summary>
              <pre className="mt-2 rounded-lg bg-slate-900 text-slate-200 p-3 text-xs overflow-auto max-h-32">
                {JSON.stringify(f.evidence, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}
