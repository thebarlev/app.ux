"use client"

export interface RecommendationRow {
  id: string
  priority: string
  title: string
  description: string
  action: string
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
}

export function AdminAuditorRecommendationsTable({
  recommendations,
}: {
  recommendations: RecommendationRow[]
}) {
  if (recommendations.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No recommendations generated for this scan.</div>
  }

  return (
    <div className="space-y-3">
      {recommendations.map((recommendation) => (
        <div key={recommendation.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[recommendation.priority] ?? "bg-slate-100 text-slate-500"}`}>
              {recommendation.priority}
            </span>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800">{recommendation.title}</h4>
            <p className="mt-1 text-sm text-slate-600">{recommendation.description}</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-600 mb-1">Action</p>
            <p className="text-sm text-blue-800">{recommendation.action}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
