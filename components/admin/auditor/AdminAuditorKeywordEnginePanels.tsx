"use client"

type KeywordEngineKeyword = {
  keyword: string
  keyword_type: string
  confidence: number
  page_count: number
}

type KeywordEngineTopic = {
  topic: string
  coverage_score: number
  missing_pages: number
}

type KeywordEngineCluster = {
  cluster: string
  top_keyword: string
  keyword_count: number
  page_count: number
  keywords: string[]
}

export type KeywordEngineReport = {
  keywords: KeywordEngineKeyword[]
  topics: KeywordEngineTopic[]
  clusters: KeywordEngineCluster[]
  counts: {
    pages: number
    keywords: number
    topics: number
    clusters: number
  }
  skipped: boolean
  error?: string
}

function numberOrZero(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function parseKeyword(value: unknown): KeywordEngineKeyword | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return {
    keyword: stringOrEmpty((value as any).keyword),
    keyword_type: stringOrEmpty((value as any).keyword_type),
    confidence: numberOrZero((value as any).confidence),
    page_count: numberOrZero((value as any).page_count),
  }
}

function parseTopic(value: unknown): KeywordEngineTopic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return {
    topic: stringOrEmpty((value as any).topic),
    coverage_score: numberOrZero((value as any).coverage_score),
    missing_pages: numberOrZero((value as any).missing_pages),
  }
}

function parseCluster(value: unknown): KeywordEngineCluster | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return {
    cluster: stringOrEmpty((value as any).cluster),
    top_keyword: stringOrEmpty((value as any).top_keyword),
    keyword_count: numberOrZero((value as any).keyword_count),
    page_count: numberOrZero((value as any).page_count),
    keywords: Array.isArray((value as any).keywords) ? (value as any).keywords.map((item: unknown) => String(item || "")).filter(Boolean) : [],
  }
}

export function getKeywordEngineReport(input: unknown): KeywordEngineReport {
  const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const countsSource =
    source.counts && typeof source.counts === "object" && !Array.isArray(source.counts)
      ? (source.counts as Record<string, unknown>)
      : {}

  return {
    keywords: Array.isArray(source.keywords) ? source.keywords.map(parseKeyword).filter((item): item is KeywordEngineKeyword => Boolean(item && item.keyword)) : [],
    topics: Array.isArray(source.topics) ? source.topics.map(parseTopic).filter((item): item is KeywordEngineTopic => Boolean(item && item.topic)) : [],
    clusters: Array.isArray(source.clusters)
      ? source.clusters.map(parseCluster).filter((item): item is KeywordEngineCluster => Boolean(item && item.cluster))
      : [],
    counts: {
      pages: numberOrZero(countsSource.pages),
      keywords: numberOrZero(countsSource.keywords),
      topics: numberOrZero(countsSource.topics),
      clusters: numberOrZero(countsSource.clusters),
    },
    skipped: Boolean(source.skipped),
    error: stringOrEmpty(source.error) || undefined,
  }
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
      {message}
    </div>
  )
}

export function AdminAuditorKeywordEngineSummary({ report }: { report: KeywordEngineReport }) {
  if (report.skipped && report.keywords.length === 0 && report.topics.length === 0 && report.clusters.length === 0) {
    return <EmptyState message={report.error || "Keyword engine was skipped because no extracted pages were available yet."} />
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Pages" value={report.counts.pages} />
        <SummaryCard label="Keywords" value={report.counts.keywords} />
        <SummaryCard label="Topics" value={report.counts.topics} />
        <SummaryCard label="Clusters" value={report.counts.clusters} />
      </div>

      {report.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{report.error}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Engine Keywords</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Keyword</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                <th className="px-4 py-3 text-left font-semibold">Pages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.keywords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No keyword engine keyword results yet.
                  </td>
                </tr>
              ) : (
                report.keywords.map((keyword) => (
                  <tr key={`${keyword.keyword}-${keyword.keyword_type}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{keyword.keyword}</td>
                    <td className="px-4 py-3 text-slate-600">{keyword.keyword_type}</td>
                    <td className="px-4 py-3 text-slate-600">{keyword.confidence.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{keyword.page_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Engine Topics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Topic</th>
                <th className="px-4 py-3 text-left font-semibold">Coverage</th>
                <th className="px-4 py-3 text-left font-semibold">Missing Pages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.topics.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    No keyword engine topics yet.
                  </td>
                </tr>
              ) : (
                report.topics.map((topic) => (
                  <tr key={topic.topic} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{topic.topic}</td>
                    <td className="px-4 py-3 text-slate-600">{topic.coverage_score.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{topic.missing_pages}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function AdminAuditorKeywordClustersTable({ report }: { report: KeywordEngineReport }) {
  if (report.clusters.length === 0) {
    return <EmptyState message={report.error || "No keyword clusters available yet."} />
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Keyword Clusters</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Cluster</th>
              <th className="px-4 py-3 text-left font-semibold">Top Keyword</th>
              <th className="px-4 py-3 text-left font-semibold">Keywords</th>
              <th className="px-4 py-3 text-left font-semibold">Pages</th>
              <th className="px-4 py-3 text-left font-semibold">Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.clusters.map((cluster) => (
              <tr key={cluster.cluster} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{cluster.cluster}</td>
                <td className="px-4 py-3 text-slate-600">{cluster.top_keyword}</td>
                <td className="px-4 py-3 text-slate-600">{cluster.keyword_count}</td>
                <td className="px-4 py-3 text-slate-600">{cluster.page_count}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    {cluster.keywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {keyword}
                      </span>
                    ))}
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
