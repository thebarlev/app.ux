"use client"

export interface CompetitorRow {
  id: string
  domain: string
  source: string
  confidence: number | null
}

const SOURCE_COLORS: Record<string, string> = {
  serp: "bg-blue-100 text-blue-700",
  heuristic: "bg-slate-100 text-slate-600",
}

export function AdminAuditorCompetitorsTable({ competitors }: { competitors: CompetitorRow[] }) {
  if (competitors.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No competitors discovered for this scan.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Domain</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Source</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {competitors.map((competitor) => (
              <tr key={competitor.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{competitor.domain}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[competitor.source] ?? "bg-slate-100 text-slate-500"}`}>
                    {competitor.source}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-500">{competitor.confidence != null ? competitor.confidence.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
