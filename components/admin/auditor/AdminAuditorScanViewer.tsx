"use client"

import { type ReactNode, useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { AdminAuditorPagesTable, type PageRow } from "./AdminAuditorPagesTable"
import { AdminAuditorHeadingSearch } from "./AdminAuditorHeadingSearch"
import { AdminAuditorRulesTable, type RuleRow } from "./AdminAuditorRulesTable"
import { AdminAuditorFindingsTable, type FindingRow } from "./AdminAuditorFindingsTable"
import { AdminAuditorPipelineLogs, type LogEntry } from "./AdminAuditorPipelineLogs"
import { AdminAuditorKeywordsTable, type KeywordRow } from "./AdminAuditorKeywordsTable"
import { AdminAuditorTopicsTable, type TopicRow } from "./AdminAuditorTopicsTable"
import { AdminAuditorRecommendationsTable, type RecommendationRow } from "./AdminAuditorRecommendationsTable"
import { AdminAuditorCompetitorsTable, type CompetitorRow } from "./AdminAuditorCompetitorsTable"
import { AdminAuditorContentGapsTable, type ContentGapRow } from "./AdminAuditorContentGapsTable"
import {
  AdminAuditorKeywordClustersTable,
  AdminAuditorKeywordEngineSummary,
  getKeywordEngineReport,
} from "./AdminAuditorKeywordEnginePanels"

export interface ScanOverview {
  id: string
  hostname: string | null
  target_url: string
  status: string
  step: string
  scan_kind: string
  created_by_role: string
  page_limit: number
  score_total: number | null
  score_breakdown: Record<string, unknown>
  report_public: Record<string, unknown>
  report_admin: Record<string, unknown>
  created_at: string
  started_at: string | null
  finished_at: string | null
  lead_email_normalized: string | null
  attempts: number
  last_error: string | null
}

const STATUS_COLORS: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  running: "bg-blue-100 text-blue-700",
  queued: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
}

function KVItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800 break-all">{value ?? "—"}</dd>
    </div>
  )
}

function ScoreBar({ value, label }: { value: number | null; label: string }) {
  const pct = typeof value === "number" ? Math.min(100, Math.max(0, value)) : 0
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-700">{value ?? "—"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AdminAuditorScanViewer({
  scan,
  pages,
  keywords,
  topics,
  competitors,
  contentGaps,
  rules,
  findings,
  logs,
  recommendations,
  onCreateTask,
}: {
  scan: ScanOverview
  pages: PageRow[]
  keywords: KeywordRow[]
  topics: TopicRow[]
  competitors: CompetitorRow[]
  contentGaps: ContentGapRow[]
  rules: RuleRow[]
  findings: FindingRow[]
  logs: LogEntry[]
  recommendations: RecommendationRow[]
  onCreateTask?: (findingId: string, scanId: string) => Promise<unknown>
}) {
  const router = useRouter()
  const [expandingPages, setExpandingPages] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)
  const scoreBreakdown = scan.score_breakdown ?? {}
  const keywordEngineReport = getKeywordEngineReport(
    scan.report_admin && typeof scan.report_admin === "object" ? (scan.report_admin as Record<string, unknown>).keyword_engine : undefined
  )
  const durationMs =
    scan.started_at && scan.finished_at
      ? new Date(scan.finished_at).getTime() - new Date(scan.started_at).getTime()
      : null

  const handleExpandPages = async () => {
    try {
      setExpandingPages(true)
      setExpandError(null)

      const res = await fetch("/api/admin/auditor/scan/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: scan.id }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || "Failed to expand scan"))
      }

      router.refresh()
    } catch (error) {
      setExpandError(error instanceof Error ? error.message : "Failed to expand scan")
    } finally {
      setExpandingPages(false)
    }
  }

  return (
    <Tabs defaultValue="overview">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="pages">Pages ({scan.page_limit ?? pages.length})</TabsTrigger>
        <TabsTrigger value="keywords">Keywords ({keywords.length})</TabsTrigger>
        <TabsTrigger value="topics">Topics ({topics.length})</TabsTrigger>
        <TabsTrigger value="keyword-engine">Keyword Engine ({keywordEngineReport.counts.keywords})</TabsTrigger>
        <TabsTrigger value="clusters">Clusters ({keywordEngineReport.counts.clusters})</TabsTrigger>
        <TabsTrigger value="competitors">Competitors ({competitors.length})</TabsTrigger>
        <TabsTrigger value="content-gaps">Content Gaps ({contentGaps.length})</TabsTrigger>
        <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
        <TabsTrigger value="recommendations">Recommendations ({recommendations.length})</TabsTrigger>
        <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
      </TabsList>

      {/* ── Overview ── */}
      <TabsContent value="overview" className="space-y-6">
        {/* Meta */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600 mb-4">Scan Metadata</h3>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KVItem label="Status" value={
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[scan.status] ?? "bg-slate-100 text-slate-500"}`}>{scan.status}</span>
            } />
            <KVItem label="Step" value={<span className="font-mono text-xs">{scan.step}</span>} />
            <KVItem label="Kind" value={scan.scan_kind} />
            <KVItem label="Role" value={scan.created_by_role} />
            <KVItem label="Target URL" value={<span className="font-mono text-xs">{scan.target_url}</span>} />
            <KVItem label="Hostname" value={scan.hostname} />
            <KVItem label="Lead email" value={scan.lead_email_normalized} />
            <KVItem label="Attempts" value={scan.attempts} />
            <KVItem label="Created" value={new Date(scan.created_at).toLocaleString("en-GB")} />
            <KVItem label="Started" value={scan.started_at ? new Date(scan.started_at).toLocaleString("en-GB") : null} />
            <KVItem label="Finished" value={scan.finished_at ? new Date(scan.finished_at).toLocaleString("en-GB") : null} />
            <KVItem label="Duration" value={durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : null} />
          </dl>
          {scan.last_error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="font-semibold">Last error:</span> {scan.last_error}
            </div>
          )}
        </div>

        {/* Scores */}
        {scan.score_total != null && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full ring-8 ring-slate-100">
                <span className="text-4xl font-bold tabular-nums text-slate-900">{scan.score_total}</span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Overall Score</h3>
                <p className="text-sm text-slate-500">AI & SEO health score</p>
              </div>
            </div>
            <div className="space-y-3">
              {Object.entries(scoreBreakdown).map(([k, v]) => (
                <ScoreBar key={k} label={k.replace(/_/g, " ")} value={typeof v === "number" ? v : null} />
              ))}
            </div>
          </div>
        )}

        {/* report_public JSON preview */}
        {Object.keys(scan.report_public ?? {}).length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Public Report Data</h3>
            <pre className="rounded-xl bg-slate-950 text-slate-200 p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(scan.report_public, null, 2)}
            </pre>
          </div>
        )}

        {/* report_admin JSON preview */}
        {Object.keys(scan.report_admin ?? {}).length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Admin Report Data</h3>
            <pre className="rounded-xl bg-slate-950 text-slate-200 p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(scan.report_admin, null, 2)}
            </pre>
          </div>
        )}
      </TabsContent>

      {/* ── Pages ── */}
      <TabsContent value="pages">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Page Crawl Budget</h3>
              <p className="text-sm text-slate-500">
                Showing up to {scan.page_limit} pages for this scan. Additional crawling only starts when you expand it.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={handleExpandPages} disabled={expandingPages}>
              {expandingPages ? "Scanning more pages..." : "Scan 20 more pages"}
            </Button>
          </div>
          {expandError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{expandError}</div>
          ) : null}
          <AdminAuditorHeadingSearch pages={pages} />
          <AdminAuditorPagesTable pages={pages} />
        </div>
      </TabsContent>

      {/* ── Keywords ── */}
      <TabsContent value="keywords">
        <AdminAuditorKeywordsTable keywords={keywords} />
      </TabsContent>

      {/* ── Topics ── */}
      <TabsContent value="topics">
        <AdminAuditorTopicsTable topics={topics} />
      </TabsContent>

      {/* ── Keyword Engine ── */}
      <TabsContent value="keyword-engine">
        <AdminAuditorKeywordEngineSummary report={keywordEngineReport} />
      </TabsContent>

      {/* ── Clusters ── */}
      <TabsContent value="clusters">
        <AdminAuditorKeywordClustersTable report={keywordEngineReport} />
      </TabsContent>

      {/* ── Competitors ── */}
      <TabsContent value="competitors">
        <AdminAuditorCompetitorsTable competitors={competitors} />
      </TabsContent>

      {/* ── Content Gaps ── */}
      <TabsContent value="content-gaps">
        <AdminAuditorContentGapsTable gaps={contentGaps} />
      </TabsContent>

      {/* ── Rules ── */}
      <TabsContent value="rules">
        <AdminAuditorRulesTable rules={rules} />
      </TabsContent>

      {/* ── Recommendations ── */}
      <TabsContent value="recommendations">
        <AdminAuditorRecommendationsTable recommendations={recommendations} />
      </TabsContent>

      {/* ── Findings ── */}
      <TabsContent value="findings">
        <AdminAuditorFindingsTable findings={findings} scanId={scan.id} onCreateTask={onCreateTask} />
      </TabsContent>

      {/* ── Reports ── */}
      <TabsContent value="reports">
        <ReportsPanel scanId={scan.id} scanStatus={scan.status} />
      </TabsContent>

      {/* ── Logs ── */}
      <TabsContent value="logs">
        <AdminAuditorPipelineLogs logs={logs} />
      </TabsContent>
    </Tabs>
  )
}

// ─── Reports panel — download Customer (.docx) and Implementation (.md) ─────

function ReportsPanel({ scanId, scanStatus }: { scanId: string; scanStatus: string }) {
  const ready = scanStatus === "done"
  const customerUrl = `/api/admin/auditor/scan/${scanId}/report/customer`
  const implementationUrl = `/api/admin/auditor/scan/${scanId}/report/implementation`

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-base font-semibold text-slate-900">Reports</h3>
        <p className="mb-6 text-sm text-slate-500">
          Generated from this scan&apos;s data. Customer report is a styled .docx for the business owner; implementation
          brief is a markdown file optimized for an AI assistant or developer.
        </p>

        {!ready && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            ⏳ The scan is still in progress. Reports will be available once it finishes (status: {scanStatus}).
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Customer report card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="mb-3 text-2xl">📄</div>
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Customer Report</h4>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Word document (.docx) in Hebrew — designed to send to the business owner. Includes scores, top issues, what
              works well, and a 90-day action plan. Easy to edit before sending.
            </p>
            {ready ? (
              <a href={customerUrl} download>
                <Button size="sm">Download .docx</Button>
              </a>
            ) : (
              <Button size="sm" disabled>Download .docx</Button>
            )}
          </div>

          {/* Implementation brief card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="mb-3 text-2xl">🤖</div>
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Implementation Brief</h4>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Markdown file with technical, prescriptive instructions. Pass to an AI assistant or developer to drive
              concrete fixes. Includes performance targets, all findings with verification steps, keywords, topics,
              page-level data.
            </p>
            <div className="flex gap-2">
              {ready ? (
                <a href={implementationUrl} download>
                  <Button size="sm">Download .md</Button>
                </a>
              ) : (
                <Button size="sm" disabled>Download .md</Button>
              )}
              {ready ? (
                <a href={`${implementationUrl}?inline=true`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">View in browser</Button>
                </a>
              ) : (
                <Button size="sm" variant="outline" disabled>View in browser</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
