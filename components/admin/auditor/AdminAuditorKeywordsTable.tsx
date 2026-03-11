"use client"

export interface KeywordRow {
  id: string
  keyword: string
  keyword_type: string
  confidence: number | null
}

const TYPE_COLORS: Record<string, string> = {
  primary: "bg-blue-100 text-blue-700",
  secondary: "bg-slate-100 text-slate-600",
  question: "bg-amber-100 text-amber-700",
  entity: "bg-emerald-100 text-emerald-700",
}

export function AdminAuditorKeywordsTable({ keywords }: { keywords: KeywordRow[] }) {
  if (keywords.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No keywords extracted for this scan.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Keyword</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keywords.map((keyword) => (
              <tr key={keyword.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-700">{keyword.keyword}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[keyword.keyword_type] ?? "bg-slate-100 text-slate-500"}`}>
                    {keyword.keyword_type}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-500">
                  {keyword.confidence != null ? keyword.confidence.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
