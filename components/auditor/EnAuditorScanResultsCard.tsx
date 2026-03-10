"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { IssueCard } from "@/components/auditor/scan-results/IssueCard"
import { IssueChecklist } from "@/components/auditor/scan-results/IssueChecklist"

type ScanData = {
  ok: true
  status: string
  score_total: number | null
  score_search: number | null
  score_ai: number | null
  issues_overview: string[]
  hostname: string | null
  finished_at: string | null
  pages_scanned: number | null
  issues_count: number
}

// ─── Score helpers (mirrors AuditorScanResults) ────────────────────────────
function scoreColor(v: number | null): { text: string; fill: string; ring: string } {
  if (v === null) return { text: "text-slate-400", fill: "bg-slate-300",    ring: "ring-slate-200" }
  if (v >= 80)    return { text: "text-emerald-600", fill: "bg-emerald-500", ring: "ring-emerald-100" }
  if (v >= 60)    return { text: "text-amber-600",   fill: "bg-amber-500",   ring: "ring-amber-100" }
  return           { text: "text-red-600",           fill: "bg-red-500",     ring: "ring-red-100" }
}

function ScoreBar({ value, label }: { value: number | null; label: string }) {
  const pct = typeof value === "number" ? Math.min(100, Math.max(0, value)) : 0
  const { text, fill } = scoreColor(value)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold tabular-nums ${text}`}>{value ?? "—"}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-700 ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────
export function EnAuditorScanResultsCard({
  scanData,
  linkId = "a_basic",
  scanId,
  token,
}: {
  scanData: ScanData
  linkId?: string
  scanId: string
  token: string
}) {
  const score  = typeof scanData.score_total === "number" ? scanData.score_total : null
  const top5   = (scanData.issues_overview || []).slice(0, 5)
  const issues = scanData.issues_overview || []
  const checkoutUrl = `/en/auditor/checkout?link_id=${encodeURIComponent(linkId)}&scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`

  return (
    <div dir="ltr" className="mx-auto max-w-6xl space-y-6 px-4">

      {/* Tagline */}
      <p className="text-start text-lg text-muted-foreground">
        We&apos;re improving your business visibility in AI &amp; SEO
      </p>

      {/* ── Issues | Score grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* Issues — 8 cols */}
        <div className="space-y-3 lg:col-span-8">
          <div className="text-start">
            <h3 className="text-base font-semibold text-slate-800">Top issues</h3>
            <p className="mt-0.5 text-sm text-slate-500">Prioritized by severity</p>
          </div>
          {top5.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm text-start">
              No major issues found.
            </div>
          ) : (
            <div className="space-y-3">
              {top5.map((issue, idx) => (
                <IssueCard key={idx} severity="WARN" text={issue} />
              ))}
            </div>
          )}
        </div>

        {/* Score — 4 cols */}
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-4">
          <CardContent className="flex flex-col items-center gap-6 p-6 text-center">

            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Audit score
            </p>

            {/* Score ring */}
            <div className={`flex h-32 w-32 flex-col items-center justify-center rounded-full ring-8 ${scoreColor(score).ring}`}>
              <span className={`text-6xl font-bold tracking-tight tabular-nums leading-none ${scoreColor(score).text}`}>
                {score !== null ? score : "—"}
              </span>
              <span className="mt-1 text-xs text-slate-400">/ 100</span>
            </div>

            {/* Score bars */}
            <div className="w-full space-y-3">
              <ScoreBar value={scanData.score_search} label="Search visibility" />
              <ScoreBar value={scanData.score_ai}     label="AI readiness" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── What's missing ─────────────────────────────────────────────── */}
      <IssueChecklist
        items={issues}
        title="What's missing"
        description="Items to address for better AI & SEO visibility"
        emptyMessage="No major issues found."
      />

      {/* ── Scan details ───────────────────────────────────────────────── */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
            Scan details
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {scanData.hostname && (
              <div>
                <dt className="text-xs text-muted-foreground">Domain</dt>
                <dd className="mt-0.5 font-medium text-slate-800" dir="ltr">{scanData.hostname}</dd>
              </div>
            )}
            {scanData.finished_at && (
              <div>
                <dt className="text-xs text-muted-foreground">Scan date</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {format(new Date(scanData.finished_at), "MMM d, yyyy")}
                </dd>
              </div>
            )}
            {typeof scanData.pages_scanned === "number" && (
              <div>
                <dt className="text-xs text-muted-foreground">Pages scanned</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{scanData.pages_scanned}</dd>
              </div>
            )}
            {typeof scanData.issues_count === "number" && (
              <div>
                <dt className="text-xs text-muted-foreground">Issues found</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{scanData.issues_count}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 text-start sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Ready to fix these issues?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Upgrade to unlock the full audit report and improvement plan.
              </p>
            </div>
            <Link href={checkoutUrl} className="shrink-0">
              <Button className="w-full sm:w-auto">Fix these issues →</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
