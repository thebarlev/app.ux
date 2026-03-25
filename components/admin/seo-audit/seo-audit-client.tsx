"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Play } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildSeoAuditCsv, buildSeoAuditJson } from "@/lib/admin/seo-audit/export"
import type { SeoActionableRecommendation, SeoAuditResponse, SeoIssue } from "@/lib/admin/seo-audit/types"

type RunResponse = ({ ok: true } & SeoAuditResponse) | { ok: false; error?: string }

const PROGRESS_STEPS = ["Validating URL and robots policy...", "Crawling internal pages...", "Analyzing SEO signals...", "Computing score and recommendations..."]

function severityVariant(issue: SeoIssue["severity"]): "default" | "secondary" | "destructive" {
  if (issue === "critical") return "destructive"
  if (issue === "warning") return "secondary"
  return "default"
}

function recommendationBadge(value: SeoActionableRecommendation["severity"]): "default" | "secondary" | "destructive" {
  if (value === "critical" || value === "high") return "destructive"
  if (value === "medium") return "secondary"
  return "default"
}

function scoreClass(score: number): string {
  if (score >= 80) return "text-green-600"
  if (score >= 60) return "text-yellow-600"
  return "text-red-600"
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SeoAuditClient() {
  const [url, setUrl] = useState("")
  const [maxPages, setMaxPages] = useState("50")
  const [loading, setLoading] = useState(false)
  const [progressText, setProgressText] = useState("Ready")
  const [elapsedSec, setElapsedSec] = useState(0)
  const [report, setReport] = useState<SeoAuditResponse | null>(null)

  useEffect(() => {
    if (!loading) return
    let idx = 0
    const tick = setInterval(() => {
      idx = (idx + 1) % PROGRESS_STEPS.length
      setProgressText(PROGRESS_STEPS[idx] || "Running SEO audit...")
    }, 1100)
    return () => clearInterval(tick)
  }, [loading])

  useEffect(() => {
    if (!loading) return
    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [loading])

  const issueSummary = useMemo(() => {
    const issues = report ? [...report.criticalIssues, ...report.warnings] : []
    return {
      critical: report?.criticalIssues.length || 0,
      warnings: report?.warnings.length || 0,
      total: report?.summary.issues || issues.length,
    }
  }, [report])

  const runAudit = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL")
      return
    }
    const parsedMax = Number.parseInt(maxPages, 10)
    setLoading(true)
    setElapsedSec(0)
    setProgressText(PROGRESS_STEPS[0] || "Running SEO audit...")
    try {
      const res = await fetch("/api/admin/seo-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          maxPages: Number.isFinite(parsedMax) ? parsedMax : 50,
        }),
      })
      const data = (await res.json()) as RunResponse
      if (!res.ok || !data.ok) {
        throw new Error(("error" in data && data.error) || "Audit failed")
      }
      setReport(data)
      toast.success("SEO audit completed")
      setProgressText(`Completed: ${data.summary.pagesScanned} pages scanned`)
    } catch (e: unknown) {
      const message = String(e instanceof Error ? e.message : e)
      toast.error(message)
      setProgressText("Audit failed")
    } finally {
      setLoading(false)
    }
  }

  const handleExportJson = () => {
    if (!report) return
    downloadText(buildSeoAuditJson(report), `seo-audit-${new Date().toISOString().slice(0, 10)}.json`, "application/json;charset=utf-8")
  }

  const handleExportCsv = () => {
    if (!report) return
    downloadText(buildSeoAuditCsv(report), `seo-audit-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SEO Audit Tool</h1>
        <p className="mt-2 text-muted-foreground">Internal admin crawler and technical SEO analyzer for public websites.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run SEO Audit</CardTitle>
          <CardDescription>Scans up to 50 same-domain pages and validates key SEO signals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Website URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max pages (1-50)</label>
              <Input value={maxPages} onChange={(e) => setMaxPages(e.target.value)} inputMode="numeric" />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={runAudit} disabled={loading}>
              <Play className="mr-2 h-4 w-4" />
              {loading ? "Running..." : "Run SEO Audit"}
            </Button>
            <Button variant="outline" onClick={handleExportJson} disabled={!report}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!report}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {progressText}
            {loading ? ` (${elapsedSec}s)` : ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Overall Score</div>
            <div className={`text-4xl font-bold ${scoreClass(report?.summary.score || 0)}`}>{report?.summary.score ?? "-"}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Pages Scanned</div>
            <div className="text-2xl font-semibold">{report?.summary.pagesScanned ?? 0}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Critical Issues</div>
            <div className="text-2xl font-semibold text-red-600">{issueSummary.critical}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Warnings</div>
            <div className="text-2xl font-semibold text-yellow-600">{issueSummary.warnings}</div>
          </div>
        </CardContent>
      </Card>

      {report ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded border p-3 text-sm">{`Technical: ${report.summary.breakdown.technical}/30`}</div>
              <div className="rounded border p-3 text-sm">{`Content: ${report.summary.breakdown.content}/30`}</div>
              <div className="rounded border p-3 text-sm">{`Structure: ${report.summary.breakdown.structure}/20`}</div>
              <div className="rounded border p-3 text-sm">{`Performance: ${report.summary.breakdown.performance}/20`}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {report.recommendations.length === 0 ? (
                <div className="text-muted-foreground">No recommendations.</div>
              ) : (
                report.recommendations.map((item, idx) => (
                  <div key={`${item.issue}-${idx}`} className="rounded border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={recommendationBadge(item.severity)}>{item.severity}</Badge>
                      <span className="font-medium">{item.issue}</span>
                      <span className="text-xs text-muted-foreground">{`${item.group} | affected: ${item.affectedPages}`}</span>
                    </div>
                    <div className="text-xs">{item.whyItMatters}</div>
                    <div className="text-xs">{`How to fix: ${item.howToFix}`}</div>
                    <div className="text-xs text-muted-foreground">{item.exampleFix}</div>
                    <div className="text-xs text-muted-foreground">{`Complexity: ${item.devComplexity} | Impact: ${item.impact}`}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Wins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {report.quickWins.length === 0 ? (
                <div className="text-muted-foreground">No quick wins identified.</div>
              ) : (
                report.quickWins.map((item, idx) => <div key={`${item.issue}-quick-${idx}`}>{`- ${item.issue} (${item.affectedPages} pages)`}</div>)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Biggest Issues (Top 3)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {report.biggestIssues.length === 0 ? (
                <div className="text-muted-foreground">No major issues identified.</div>
              ) : (
                report.biggestIssues.map((item, idx) => (
                  <div key={`${item.issue}-big-${idx}`} className="rounded border p-2">
                    <div className="font-medium">{item.issue}</div>
                    <div className="text-xs text-muted-foreground">{`${item.severity} | impact: ${item.impact} | affected: ${item.affectedPages}`}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Growth Opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {report.growthOpportunities.length === 0 ? (
                <div className="text-muted-foreground">No growth opportunities detected.</div>
              ) : (
                report.growthOpportunities.map((item, idx) => (
                  <div key={`${item.title}-${idx}`} className="rounded border p-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs">{item.rationale}</div>
                    <div className="text-xs text-muted-foreground">{`Opportunity score: ${item.opportunityScore} | Affected pages: ${item.affectedPages}`}</div>
                    <div className="text-xs">{`Suggested action: ${item.suggestedAction}`}</div>
                    <div className="text-xs text-muted-foreground">{`Examples: ${item.examples.join(", ") || "-"}`}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pages ({report.pages.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Depth</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.pages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        No pages scanned
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.pages.map((page) => (
                      <TableRow key={page.url}>
                        <TableCell className="max-w-[380px] truncate" title={page.url}>
                          {page.url}
                          {page.isMoneyPage ? <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-[10px] text-yellow-800">Money</span> : null}
                        </TableCell>
                        <TableCell>{page.status}</TableCell>
                        <TableCell>{page.depth}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={page.title.value}>
                          {page.title.value || "-"}
                        </TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-sm">{`${page.issues.length} issues`}</summary>
                            <div className="mt-2 space-y-2">
                              <div className="grid gap-2">
                                {page.issues.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">No page issues</div>
                                ) : (
                                  page.issues.map((issue, idx) => (
                                    <div key={`${page.url}-${issue.code}-${idx}`} className="flex items-center gap-2">
                                      <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                                      <span className="text-xs">{issue.message}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {`Canonical: ${page.canonical.exists ? page.canonical.value || "yes" : "missing"} | H1: ${page.h1.count} | Schema: ${page.schemaTypes.join(", ") || "none"} | Missing alt: ${page.images.missing_alt} | Response: ${page.response_time_ms}ms`}
                              </div>
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
