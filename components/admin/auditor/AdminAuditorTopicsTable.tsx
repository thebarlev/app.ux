"use client"

export interface TopicRow {
  id: string
  topic: string
  coverage_score: number | null
  missing_pages: number | null
}

export function AdminAuditorTopicsTable({ topics }: { topics: TopicRow[] }) {
  if (topics.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No topics discovered for this scan.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Topic</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Coverage score</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Missing pages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topics.map((topic) => (
              <tr key={topic.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-700">{topic.topic}</td>
                <td className="px-4 py-3 tabular-nums text-slate-500">
                  {topic.coverage_score != null ? `${topic.coverage_score.toFixed(2)}%` : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-500">{topic.missing_pages ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
