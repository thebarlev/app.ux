"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export interface RuleRow {
  id: string
  rule_key: string
  category: string
  status: string
  impact: string
  effort: string
  weight: number
  recommendation_he: string
  evidence?: Record<string, unknown>
}

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  fail: "bg-red-100 text-red-700",
}

const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-600 font-semibold",
  medium: "text-amber-600 font-medium",
  low: "text-slate-400",
}

const CATEGORY_COLORS: Record<string, string> = {
  technical: "bg-blue-100 text-blue-700",
  schema: "bg-violet-100 text-violet-700",
  ai_readiness: "bg-emerald-100 text-emerald-700",
  tracking: "bg-slate-100 text-slate-600",
}

export function AdminAuditorRulesTable({ rules }: { rules: RuleRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const failed = rules.filter((r) => r.status === "fail")
  const warned = rules.filter((r) => r.status === "warn")
  const passed = rules.filter((r) => r.status === "pass")

  if (rules.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No rules found for this scan.</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 font-medium">{failed.length} failed</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 font-medium">{warned.length} warn</span>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 font-medium">{passed.length} pass</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Rule</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Impact</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Effort</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...failed, ...warned, ...passed].map((rule) => (
                <>
                  <tr
                    key={rule.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => toggle(rule.id)}
                  >
                    <td className="px-2 py-3 text-slate-400">
                      {expanded.has(rule.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{rule.rule_key}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[rule.category] ?? "bg-slate-100 text-slate-500"}`}>{rule.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[rule.status] ?? "bg-slate-100 text-slate-500"}`}>{rule.status}</span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${IMPACT_COLORS[rule.impact] ?? "text-slate-400"}`}>{rule.impact}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{rule.effort}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{rule.weight}</td>
                  </tr>
                  {expanded.has(rule.id) && (
                    <tr key={`${rule.id}-detail`}>
                      <td colSpan={7} className="px-4 pb-4 pt-2 bg-slate-50">
                        <p className="text-sm text-slate-700 mb-2">{rule.recommendation_he}</p>
                        {rule.evidence && Object.keys(rule.evidence).length > 0 && (
                          <pre className="rounded-lg bg-slate-900 text-slate-200 p-3 text-xs overflow-auto max-h-40">
                            {JSON.stringify(rule.evidence, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
