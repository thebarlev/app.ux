"use client"

export interface ContentGapRow {
  id: string
  keyword: string
  topic: string | null
  priority: string
  competitor_count: number
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
}

export function AdminAuditorContentGapsTable({ gaps }: { gaps: ContentGapRow[] }) {
  if (gaps.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No content gaps detected for this scan.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Keyword</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Topic</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Competitors</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gaps.map((gap) => (
              <tr key={gap.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-700">{gap.keyword}</td>
                <td className="px-4 py-3 text-slate-500">{gap.topic ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums text-slate-500">{gap.competitor_count}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[gap.priority] ?? "bg-slate-100 text-slate-500"}`}>
                    {gap.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
