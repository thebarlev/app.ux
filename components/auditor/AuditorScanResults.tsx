"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { IssueCard } from "@/components/auditor/scan-results/IssueCard"
import { IssueChecklist } from "@/components/auditor/scan-results/IssueChecklist"
import { ScanProgress } from "@/components/auditor/scan-progress/ScanProgress"

type ApiState =
  | { ok: true; scan: any; pages: any[]; rules: any[]; logs: any[] }
  | { ok: false; error: string; status?: number }

const STEP_LABELS_HE: Record<string, string> = {
  normalize: "נרמול + SSRF",
  robots: "robots.txt",
  sitemap: "sitemap.xml",
  ai_files: "קבצי AI readiness",
  sample: "דגימת עמודים",
  fetch_pages: "משיכת עמודים",
  extract: "חילוץ נתונים",
  rules: "חוקים + ציון",
  persist: "שמירה + סיום",
  done: "הושלם",
}

const STEP_LABELS_EN: Record<string, string> = {
  normalize: "Normalize + SSRF",
  robots: "robots.txt",
  sitemap: "sitemap.xml",
  ai_files: "AI readiness files",
  sample: "Page sampling",
  fetch_pages: "Fetching pages",
  extract: "Extracting data",
  rules: "Rules + scoring",
  persist: "Save + finish",
  done: "Done",
}

function stepLabel(step: string, locale: "he" | "en"): string {
  const labels = locale === "en" ? STEP_LABELS_EN : STEP_LABELS_HE
  return labels[step] ?? step
}

function rulePriorityScore(r: any): number {
  const statusScore = r.status === "fail" ? 100 : r.status === "warn" ? 50 : 0
  const impactScore = r.impact === "high" ? 30 : r.impact === "medium" ? 15 : 5
  const weightScore = typeof r.weight === "number" ? Math.min(20, r.weight) : 0
  return statusScore + impactScore + weightScore
}

const STRINGS = {
  he: {
    scan: "סריקה",
    loading: "טוען...",
    back: "חזרה",
    status: "סטטוס",
    step: "שלב",
    domain: "דומיין",
    scanId: "מזהה סריקה",
    continuing: "ממשיך...",
    score: "ציון כללי",
    scoreSearch: "חשיפה בחיפוש",
    scoreAi: "מוכנות AI",
    gaps: "מה חסר",
    whatToDo: "מה צריך לעשות",
    top5: "עדיפויות",
    top5Desc: "ממויין לפי חומרה והשפעה",
    noRulesYet: "עדיין אין חוקים.",
    rules: "כל ההמלצות",
    rulesDesc: "Pass / Warn / Fail",
    noRules: "אין עדיין.",
    liveLogs: "לוג סריקה",
    logsDesc: "מתעדכן כל 2 שניות",
    noLogs: "אין עדיין.",
    noIssues: "לא נמצאו בעיות מהותיות.",
    scanInProgress: "הסריקה בתהליך",
    scanInProgressDesc: "הנתונים יטענו כשהסריקה תסתיים.",
    growthPotential: "פוטנציאל צמיחה",
    growthDesc: "שיפור אפשרי על ידי תיקון כשלים",
    growthSeo: "שיפור חשיפה בחיפוש",
    growthAi: "נראות לסורקי AI",
    growthContent: "אינדוקס תוכן",
    growthNone: "לא נמצאו שיפורים פוטנציאליים.",
  },
  en: {
    scan: "Scan",
    loading: "Loading...",
    back: "Back",
    status: "Status",
    step: "Step",
    domain: "Domain",
    scanId: "Scan ID",
    continuing: "continuing...",
    score: "Overall score",
    scoreSearch: "Search visibility",
    scoreAi: "AI readiness",
    gaps: "What's missing",
    whatToDo: "What to do",
    top5: "Priorities",
    top5Desc: "Sorted by severity and impact",
    noRulesYet: "No rules yet.",
    rules: "All recommendations",
    rulesDesc: "Pass / Warn / Fail",
    noRules: "None yet.",
    liveLogs: "Scan log",
    logsDesc: "Updates every 2 seconds",
    noLogs: "None yet.",
    noIssues: "No major issues found.",
    scanInProgress: "Scan in progress",
    scanInProgressDesc: "Results will load when the scan completes.",
    growthPotential: "Growth Potential",
    growthDesc: "Improvement available by fixing failed rules",
    growthSeo: "Search visibility improvement",
    growthAi: "AI crawler discoverability",
    growthContent: "Content indexing improvements",
    growthNone: "No further improvements detected.",
  },
}

// ─── Skeleton card ─────────────────────────────────────────────────────────
function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-4 w-1/3 animate-pulse rounded-xl bg-slate-200" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 animate-pulse rounded-xl bg-slate-200" style={{ width: `${85 - i * 10}%` }} />
        ))}
      </div>
    </div>
  )
}

// ─── Score helpers ─────────────────────────────────────────────────────────
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

// ─── Status dot ────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === "done" ? "bg-emerald-500" :
    status === "failed" ? "bg-red-500" :
    "bg-amber-400 animate-pulse"
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

// ─── Growth potential ───────────────────────────────────────────────────────
const SEO_PATTERNS   = ["canonical", "robots", "sitemap", "meta", "og", "title", "h1", "redirect", "ssl", "mobile", "hreflang", "pagination", "noindex"]
const AI_PATTERNS    = ["ai", "llm", "brand", "schema", "structured", "faq", "knowledge", "q_and_a", "entity", "nlu", "speakable", "about", "breadcrumb"]
const CONTENT_PATTERNS = ["content", "lang", "text", "image", "alt", "link", "anchor", "heading", "duplicate", "thin", "word", "readab"]

function classifyRule(ruleKey: string): "seo" | "ai" | "content" {
  const k = String(ruleKey).toLowerCase()
  if (AI_PATTERNS.some((p) => k.includes(p)))      return "ai"
  if (SEO_PATTERNS.some((p) => k.includes(p)))      return "seo"
  if (CONTENT_PATTERNS.some((p) => k.includes(p))) return "content"
  return "seo" // default to SEO bucket
}

function ruleGainWeight(r: any): number {
  // prefer explicit numeric weight from rule data
  if (typeof r.weight === "number" && r.weight > 0) return Math.min(10, r.weight)
  if (r.impact === "high")   return 8
  if (r.impact === "medium") return 5
  if (r.impact === "low")    return 2
  return 3
}

type GrowthBreakdown = {
  seo: number
  ai: number
  content: number
  total: number
  pct: number
}

function computeGrowth(rules: any[]): GrowthBreakdown {
  let seo = 0, ai = 0, content = 0

  for (const r of rules) {
    if (r.status !== "fail" && r.status !== "warn") continue
    const weight = ruleGainWeight(r)
    // warn counts half, fail counts full
    const pts = r.status === "fail" ? weight : Math.round(weight * 0.5)
    const cat = classifyRule(String(r.rule_key ?? ""))
    if (cat === "ai")      ai      += pts
    else if (cat === "content") content += pts
    else                    seo     += pts
  }

  // cap individual buckets to realistic ceilings
  seo     = Math.min(seo, 40)
  ai      = Math.min(ai, 40)
  content = Math.min(content, 20)

  const total = seo + ai + content
  // express as 0-100 where 100 = maximum possible improvement (100 pts)
  const pct = Math.min(100, total)

  return { seo, ai, content, total, pct }
}

// A slim labelled progress bar for growth metrics
function GrowthBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  if (value === 0) return null
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold tabular-nums text-violet-700">+{value} pts</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function AuditorScanResults({
  scanId,
  locale = "he",
  basePath = "/auditor",
  showBackExport = true,
}: {
  scanId: string
  locale?: "he" | "en"
  basePath?: string
  showBackExport?: boolean
}) {
  const t = STRINGS[locale]

  const [state, setState] = useState<ApiState>({ ok: false, error: t.loading })
  const [isContinuing, setIsContinuing] = useState(false)
  const continuingRef = useRef(false)

  const load = async () => {
    try {
      const r = await fetch(`/api/auditor/scans/${scanId}`, { method: "GET" })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      setState({ ok: true, scan: j.scan, pages: j.pages || [], rules: j.rules || [], logs: j.logs || [] })
    } catch (e: any) {
      setState({ ok: false, error: String(e?.message || e) })
    }
  }

  const triggerContinue = async () => {
    if (continuingRef.current) return
    continuingRef.current = true
    setIsContinuing(true)
    try {
      const r = await fetch(`/api/auditor/scans/${scanId}/continue`, { method: "POST" })
      if (r.status === 409) return
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Continue failed (${r.status})`)
    } catch {
      // ignore transient continue errors
    } finally {
      continuingRef.current = false
      setIsContinuing(false)
    }
  }

  useEffect(() => {
    load()
  
    const tmr = setInterval(() => {
      setState((prev) => {
        if (!prev.ok) return prev
        const status = prev.scan?.status
        if (status === "done" || status === "failed") return prev
        load()
        return prev
      })
    }, 2000)
  
    return () => clearInterval(tmr)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId])

  const scan = state.ok ? state.scan : null
  const rules = state.ok ? state.rules : []

  useEffect(() => {
    if (!state.ok) return
    const status = String(scan?.status || "")
    if (status === "done" || status === "failed") return
    triggerContinue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, scan?.status, scan?.step])

  const top5 = useMemo(() => [...rules].sort((a, b) => rulePriorityScore(b) - rulePriorityScore(a)).slice(0, 5), [rules])
  const breakdown = scan?.score_breakdown || {}
  const growth = useMemo(() => computeGrowth(rules), [rules])

  // ── Error state ──────────────────────────────────────────────────────────
  if (!state.ok && state.error !== t.loading) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="text-start">
          <CardTitle>{t.scan}</CardTitle>
          <CardDescription dir="ltr">{scanId}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-danger text-start">{state.error}</div>
          {showBackExport && (
            <div className="mt-4 text-start">
              <Link href={basePath} className="underline underline-offset-4">{t.back}</Link>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const rp = scan?.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const issuesOverview = Array.isArray(rp.issues_overview) ? rp.issues_overview : []
  const scoreTotal = typeof scan?.score_total === "number" ? scan.score_total : (typeof rp.score_total === "number" ? rp.score_total : null)
  const scoreSearch = typeof rp.score_search === "number" ? rp.score_search : (typeof breakdown.technical === "number" ? breakdown.technical : null)
  const scoreAi = typeof rp.score_ai === "number" ? rp.score_ai : (typeof breakdown.ai_readiness === "number" ? breakdown.ai_readiness : null)
  const isDone = String(scan?.status) === "done"
  const currentStep = String(scan?.step || "")

  // Try to extract hostname from scan data
  const hostname = scan?.hostname || scan?.url || scan?.site_url || null

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6">
        <div className="text-start">
          <h2 className="text-2xl font-bold text-slate-900">
            {hostname ? hostname : t.scan}
          </h2>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-medium text-slate-700">{t.scanId}:</span>
              <span className="font-mono text-xs" dir="ltr">{scanId.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-medium text-slate-700">{t.status}:</span>
              <span className="flex items-center gap-1.5">
                <StatusDot status={String(scan?.status ?? "")} />
                <span>{String(scan?.status ?? "—")}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-medium text-slate-700">{t.step}:</span>
              <span>{stepLabel(currentStep, locale)}</span>
              {isContinuing && <span className="text-xs text-muted-foreground">({t.continuing})</span>}
            </div>
          </dl>

          {scan?.error && <div className="mt-2 text-sm text-danger">{String(scan.error)}</div>}
        </div>

        {showBackExport && (
          <div className="flex shrink-0 gap-2">
            <Link href={basePath}>
              <Button variant="secondary">{t.back}</Button>
            </Link>
            <a href={`/api/auditor/scans/${scanId}/export`} target="_blank" rel="noreferrer">
              <Button>Export JSON</Button>
            </a>
          </div>
        )}
      </div>

      {/* ── Initial loading (no data yet) ───────────────────────────────── */}
      {!state.ok && state.error === t.loading && (
        <>
          {/* Show a "starting" progress bar even before the first API response */}
          <ScanProgress currentStep="" isDone={false} locale={locale} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <SkeletonCard rows={4} />
              <SkeletonCard rows={3} />
            </div>
            <div className="lg:col-span-4">
              <SkeletonCard rows={5} />
            </div>
          </div>
        </>
      )}

      {/* ── Scan in progress (data loaded, still running) ────────────────── */}
      {state.ok && !isDone && (
        <>
          <ScanProgress currentStep={currentStep} isDone={false} locale={locale} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <SkeletonCard rows={4} />
              <SkeletonCard rows={3} />
            </div>
            <div className="lg:col-span-4">
              <SkeletonCard rows={6} />
            </div>
          </div>
        </>
      )}

      {/* ── Done: full results ──────────────────────────────────────────── */}
      {state.ok && isDone && (
        <>
          {/* Issues | Score grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

            {/* Issues — 8 cols */}
            <div className="space-y-4 lg:col-span-8">
              <div className="text-start">
                <h3 className="text-base font-semibold text-slate-800">{t.top5}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{t.top5Desc}</p>
              </div>
              {top5.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm text-start">
                  {t.noRulesYet}
                </div>
              ) : (
                <div className="space-y-3">
                  {top5.map((r: any) => {
                    const severity = r.status === "fail" ? "ERROR" : r.status === "warn" ? "WARN" : "INFO"
                    // EN: prefer English fields; fall back to message (often EN) before Hebrew copy
                    const issueText = locale === "en"
                      ? (r.recommendation || r.message || r.recommendation_he || r.rule_key)
                      : (r.recommendation_he || r.recommendation || r.message || r.rule_key)
                    return (
                      <IssueCard
                        key={String(r.rule_key)}
                        severity={severity}
                        text={String(issueText ?? "")}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* Score — 4 cols */}
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-4">
              <CardContent className="flex flex-col items-center gap-6 p-6 text-center">

                {/* Title */}
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {t.score}
                </p>

                {/* Score ring */}
                <div className={`flex h-32 w-32 flex-col items-center justify-center rounded-full ring-8 ${scoreColor(scoreTotal).ring}`}>
                  <span className={`text-6xl font-bold tracking-tight tabular-nums leading-none ${scoreColor(scoreTotal).text}`}>
                    {typeof scoreTotal === "number" ? scoreTotal : "—"}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">/ 100</span>
                </div>

                {/* Core metrics */}
                <div className="w-full space-y-3">
                  <ScoreBar value={scoreSearch} label={t.scoreSearch} />
                  <ScoreBar value={scoreAi} label={t.scoreAi} />
                </div>

                {/* Divider */}
                <div className="w-full border-t border-slate-100" />

                {/* Growth Potential section */}
                <div className="w-full space-y-3 text-start">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      {t.growthPotential}
                    </p>
                    {growth.total > 0 && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                        +{growth.total} pts
                      </span>
                    )}
                  </div>

                  {growth.total === 0 ? (
                    <p className="text-xs text-slate-400">{t.growthNone}</p>
                  ) : (
                    <>
                      {/* Overall growth bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{t.growthDesc}</span>
                          <span className="font-semibold tabular-nums text-violet-700">{growth.pct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all duration-700"
                            style={{ width: `${growth.pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Breakdown bars */}
                      <div className="space-y-2 pt-1">
                        <GrowthBar
                          label={t.growthSeo}
                          value={growth.seo}
                          max={40}
                          color="bg-sky-400"
                        />
                        <GrowthBar
                          label={t.growthAi}
                          value={growth.ai}
                          max={40}
                          color="bg-indigo-400"
                        />
                        <GrowthBar
                          label={t.growthContent}
                          value={growth.content}
                          max={20}
                          color="bg-teal-400"
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Checklist */}
          <IssueChecklist
            items={issuesOverview.map((s: unknown) => String(s))}
            title={t.gaps}
            description={t.whatToDo}
            emptyMessage={t.noIssues}
          />

          {/* All recommendations */}
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="text-start">
              <CardTitle>{t.rules}</CardTitle>
              <CardDescription>{t.rulesDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.length === 0 ? (
                <div className="text-sm text-muted-foreground text-start">{t.noRules}</div>
              ) : (
                <div className="space-y-1">
                  {rules
                    .slice()
                    .sort((a: any, b: any) => rulePriorityScore(b) - rulePriorityScore(a))
                    .map((r: any) => {
                      const ruleText = locale === "en"
                        ? (r.recommendation || r.message || r.recommendation_he || r.rule_key)
                        : (r.recommendation_he || r.recommendation || r.message || r.rule_key)
                      return (
                        <div
                          key={String(r.rule_key)}
                          className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-0"
                        >
                          <div className="text-start">
                            <div className="text-sm font-medium text-slate-800" dir="auto">{String(ruleText ?? "")}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{String(r.rule_key)}</div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.status === "fail" ? "bg-red-100 text-red-700" :
                            r.status === "warn" ? "bg-amber-100 text-amber-700" :
                            "bg-emerald-100 text-emerald-700"
                          }`}>
                            {String(r.status).toUpperCase()}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan log */}
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="text-start">
              <CardTitle>{t.liveLogs}</CardTitle>
              <CardDescription>{t.logsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-[280px] overflow-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                {(state.ok ? state.logs : []).length === 0 ? (
                  <div className="text-sm text-muted-foreground text-start">{t.noLogs}</div>
                ) : (
                  <div className="space-y-2">
                    {state.logs.map((l: any, idx: number) => (
                      <div key={idx} className="text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground" dir="ltr">{String(l.ts)}</span>
                          <span className={`font-semibold ${l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-600" : "text-slate-500"}`}>
                            {String(l.level).toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-0.5 text-slate-700" dir="auto">{String(l.message)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
