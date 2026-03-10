"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

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
  },
  en: {
    scan: "Scan",
    loading: "Loading...",
    back: "Back",
    status: "Status",
    step: "Step",
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
  },
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
  const isRtl = locale === "he"
  const textAlign = isRtl ? "text-right" : "text-left"

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
        if (status === "done" || status === "failed") {
          return prev
        }
  
        load()
        return prev
      })
    }, 2000)
  
    return () => clearInterval(tmr)
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

  if (!state.ok) {
    return (
      <Card>
        <CardHeader className={textAlign}>
          <CardTitle>{t.scan}</CardTitle>
          <CardDescription dir="ltr">{scanId}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`text-sm text-danger ${textAlign}`}>{state.error}</div>
          {showBackExport && (
            <div className={`mt-4 ${textAlign}`}>
              <Link href={basePath} className="underline underline-offset-4">
                {t.back}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const rp = scan?.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const issuesOverview = Array.isArray(rp.issues_overview) ? rp.issues_overview : []
  const scoreTotal = typeof scan?.score_total === "number" ? scan.score_total : (typeof rp.score_total === "number" ? rp.score_total : null)
  const scoreSearch = typeof rp.score_search === "number" ? rp.score_search : null
  const scoreAi = typeof rp.score_ai === "number" ? rp.score_ai : null
  const isDone = String(scan?.status) === "done"

  return (
    <div className="space-y-6">
      <div className={`flex items-start justify-between gap-6 ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={textAlign}>
          <h2 className="text-2xl font-semibold">{t.scan}</h2>
          <div className="mt-1 text-xs text-muted-foreground break-all" dir="ltr">
            {scanId}
          </div>
          <div className="mt-2 text-sm">
            <span className="font-medium">{t.status}:</span> {String(scan?.status)}{" "}
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="font-medium">{t.step}:</span> {stepLabel(String(scan?.step), locale)}
            {isContinuing ? <span className={`${isRtl ? "mr-2" : "ml-2"} text-muted-foreground`}>({t.continuing})</span> : null}
          </div>
          {scan?.error ? <div className="mt-2 text-sm text-danger">{String(scan.error)}</div> : null}
        </div>
        {showBackExport && (
          <div className="flex gap-2">
            <Link href={basePath}>
              <Button variant="secondary">{t.back}</Button>
            </Link>
            <a href={`/api/auditor/scans/${scanId}/export`} target="_blank" rel="noreferrer">
              <Button>Export JSON</Button>
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-[var(--primary)]/30 bg-[var(--secondary)]">
          <CardHeader className={textAlign}>
            <CardTitle className="text-[var(--primary)]">{t.score}</CardTitle>
            <CardDescription>0–100</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-5xl font-bold text-[var(--primary)] ${textAlign}`}>
              {typeof scoreTotal === "number" ? scoreTotal : "-"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--fg)]">
              <div className={textAlign}>{t.scoreSearch}: {scoreSearch ?? breakdown.technical ?? "-"}</div>
              <div className={textAlign}>{t.scoreAi}: {scoreAi ?? breakdown.ai_readiness ?? "-"}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-[var(--primary)]/20">
          <CardHeader className={textAlign}>
            <CardTitle>{t.top5}</CardTitle>
            <CardDescription>{t.top5Desc}</CardDescription>
          </CardHeader>
          <CardContent>
            {top5.length === 0 ? (
              <div className={`text-sm text-muted-foreground ${textAlign}`}>{t.noRulesYet}</div>
            ) : (
              <div className="space-y-3">
                {top5.map((r: any) => (
                  <div key={String(r.rule_key)} className={`rounded-lg border border-[var(--primary)]/20 bg-white p-4 ${textAlign}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "fail" ? "bg-danger/20 text-danger" :
                        r.status === "warn" ? "bg-amber-500/20 text-amber-700" :
                        "bg-[var(--primary)]/20 text-[var(--primary)]"
                      }`}>
                        {String(r.status).toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground" dir="ltr">{String(r.rule_key)}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium">{String(r.recommendation_he)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isDone && issuesOverview.length > 0 && (
        <Card className="border-[var(--primary)]/20">
          <CardHeader className={textAlign}>
            <CardTitle className="text-[var(--primary)]">{t.gaps}</CardTitle>
            <CardDescription>{t.whatToDo}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className={`space-y-2 ${isRtl ? "list-disc pr-5" : "list-disc pl-5"}`}>
              {issuesOverview.map((issue: string, idx: number) => (
                <li key={idx} className="text-sm">{String(issue)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isDone && issuesOverview.length === 0 && (
        <Card className="border-[var(--primary)]/20 bg-[var(--secondary)]">
          <CardContent className="pt-6">
            <p className={`text-sm text-[var(--primary)] font-medium ${textAlign}`}>{t.noIssues}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-[var(--primary)]/10">
        <CardHeader className={textAlign}>
          <CardTitle>{t.rules}</CardTitle>
          <CardDescription>{t.rulesDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className={`text-sm text-muted-foreground ${textAlign}`}>{t.noRules}</div>
          ) : (
            <div className="space-y-2">
              {rules
                .slice()
                .sort((a: any, b: any) => rulePriorityScore(b) - rulePriorityScore(a))
                .map((r: any) => (
                  <div key={String(r.rule_key)} className="flex items-start justify-between gap-3 border-b border-[var(--primary)]/10 py-3 last:border-0">
                    <div className={textAlign}>
                      <div className="text-sm font-medium">{String(r.recommendation_he)}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{String(r.rule_key)}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                      r.status === "fail" ? "bg-danger/20 text-danger" :
                      r.status === "warn" ? "bg-amber-500/20 text-amber-700" :
                      "bg-[var(--primary)]/20 text-[var(--primary)]"
                    }`}>
                      {String(r.status).toUpperCase()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--primary)]/10">
        <CardHeader className={textAlign}>
          <CardTitle>{t.liveLogs}</CardTitle>
          <CardDescription>{t.logsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[280px] overflow-auto rounded-lg border border-[var(--primary)]/10 bg-[var(--secondary)]/50 p-3">
            {(state.ok ? state.logs : []).length === 0 ? (
              <div className={`text-sm text-muted-foreground ${textAlign}`}>{t.noLogs}</div>
            ) : (
              <div className="space-y-2">
                {state.logs.map((l: any, idx: number) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-muted-foreground" dir="ltr">{String(l.ts)}</div>
                      <div className="font-medium">{String(l.level).toUpperCase()}</div>
                    </div>
                    <div className={`mt-1 ${textAlign}`}>{String(l.message)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
