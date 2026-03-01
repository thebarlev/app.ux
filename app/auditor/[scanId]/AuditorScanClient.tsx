"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

type ApiState =
  | { ok: true; scan: any; pages: any[]; rules: any[]; logs: any[] }
  | { ok: false; error: string; status?: number }

function stepLabel(step: string): string {
  switch (step) {
    case "normalize":
      return "נרמול + SSRF"
    case "robots":
      return "robots.txt"
    case "sitemap":
      return "sitemap.xml"
    case "ai_files":
      return "קבצי AI readiness"
    case "sample":
      return "דגימת עמודים"
    case "fetch_pages":
      return "משיכת עמודים"
    case "extract":
      return "חילוץ נתונים"
    case "rules":
      return "חוקים + ציון"
    case "persist":
      return "שמירה + סיום"
    case "done":
      return "הושלם"
    default:
      return step
  }
}

function rulePriorityScore(r: any): number {
  const statusScore = r.status === "fail" ? 100 : r.status === "warn" ? 50 : 0
  const impactScore = r.impact === "high" ? 30 : r.impact === "medium" ? 15 : 5
  const weightScore = typeof r.weight === "number" ? Math.min(20, r.weight) : 0
  return statusScore + impactScore + weightScore
}

export default function AuditorScanClient({ scanId }: { scanId: string }) {
  const [state, setState] = useState<ApiState>({ ok: false, error: "טוען..." })
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
      // ignore transient continue errors; UI will show scan error if it fails permanently.
    } finally {
      continuingRef.current = false
      setIsContinuing(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId])

  const scan = state.ok ? state.scan : null
  const rules = state.ok ? state.rules : []

  // Drive the state machine from the client until it completes.
  useEffect(() => {
    if (!state.ok) return
    const status = String(scan?.status || "")
    if (status === "done" || status === "failed") return
    triggerContinue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, scan?.status, scan?.step])

  const top5 = useMemo(() => {
    return [...rules].sort((a, b) => rulePriorityScore(b) - rulePriorityScore(a)).slice(0, 5)
  }, [rules])

  const breakdown = scan?.score_breakdown || {}

  if (!state.ok) {
    return (
      <Card>
        <CardHeader className="text-right">
          <CardTitle>סריקה</CardTitle>
          <CardDescription dir="ltr">{scanId}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-danger text-right">{state.error}</div>
          <div className="mt-4 text-right">
            <Link href="/auditor" className="underline underline-offset-4">
              חזרה
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="text-right">
          <h1 className="text-2xl font-semibold">סריקה</h1>
          <div className="mt-1 text-xs text-muted-foreground break-all" dir="ltr">
            {scanId}
          </div>
          <div className="mt-2 text-sm">
            <span className="font-medium">סטטוס:</span> {String(scan?.status)}{" "}
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="font-medium">שלב:</span> {stepLabel(String(scan?.step))}
            {isContinuing ? <span className="mr-2 text-muted-foreground">(ממשיך...)</span> : null}
          </div>
          {scan?.error ? <div className="mt-2 text-sm text-danger">{String(scan.error)}</div> : null}
        </div>
        <div className="flex gap-2">
          <Link href="/auditor">
            <Button variant="secondary">חזרה</Button>
          </Link>
          <a href={`/api/auditor/scans/${scanId}/export`} target="_blank" rel="noreferrer">
            <Button>Export JSON</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="text-right">
            <CardTitle>ציון</CardTitle>
            <CardDescription>0–100</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold text-right">{typeof scan?.score_total === "number" ? scan.score_total : "-"}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="text-right">Technical: {breakdown.technical ?? "-"}</div>
              <div className="text-right">Schema: {breakdown.schema ?? "-"}</div>
              <div className="text-right">AI: {breakdown.ai_readiness ?? "-"}</div>
              <div className="text-right">Tracking: {breakdown.tracking ?? "-"}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="text-right">
            <CardTitle>Top 5 Priorities</CardTitle>
            <CardDescription>ממויין לפי fail/warn + impact + weight</CardDescription>
          </CardHeader>
          <CardContent>
            {top5.length === 0 ? (
              <div className="text-sm text-muted-foreground text-right">עדיין אין חוקים.</div>
            ) : (
              <div className="space-y-3">
                {top5.map((r: any) => (
                  <div key={String(r.rule_key)} className="rounded-ui border border-border p-3 text-right">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground" dir="ltr">
                        {String(r.rule_key)}
                      </div>
                      <div className="text-sm font-medium">
                        {String(r.status).toUpperCase()} • {String(r.impact)} • effort {String(r.effort)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm">{String(r.recommendation_he)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="text-right">
          <CardTitle>Rules</CardTitle>
          <CardDescription>Pass/Warn/Fail</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-sm text-muted-foreground text-right">אין עדיין.</div>
          ) : (
            <div className="space-y-2">
              {rules
                .slice()
                .sort((a: any, b: any) => rulePriorityScore(b) - rulePriorityScore(a))
                .map((r: any) => (
                  <div key={String(r.rule_key)} className="flex items-start justify-between gap-3 border-b border-border/60 py-2">
                    <div className="text-right">
                      <div className="text-sm font-medium">{String(r.recommendation_he)}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {String(r.rule_key)}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">{String(r.status).toUpperCase()}</div>
                      <div className="text-muted-foreground">{String(r.category)}</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="text-right">
          <CardTitle>Live logs</CardTitle>
          <CardDescription>מתעדכן כל 2 שניות</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-auto rounded-ui border border-border bg-card/50 p-3">
            {(state.ok ? state.logs : []).length === 0 ? (
              <div className="text-sm text-muted-foreground text-right">אין עדיין.</div>
            ) : (
              <div className="space-y-2">
                {state.logs.map((l: any, idx: number) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-muted-foreground" dir="ltr">
                        {String(l.ts)}
                      </div>
                      <div className="font-medium">{String(l.level).toUpperCase()}</div>
                    </div>
                    <div className="mt-1 text-right">{String(l.message)}</div>
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

