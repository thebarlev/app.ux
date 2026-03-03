"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, RefreshCw, Search } from "lucide-react"

export default function AdminAuditorPage() {
  const [url, setUrl] = useState("")
  const [scanId, setScanId] = useState<string | null>(null)
  const [scanToken, setScanToken] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [continueLoading, setContinueLoading] = useState(false)

  const fetchStatus = useCallback(async (sid: string) => {
    try {
      const r = await fetch(`/api/admin/auditor/scan/status?scanId=${encodeURIComponent(sid)}`)
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      setStatus(j)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleStart = async () => {
    const u = url.trim()
    if (!u) {
      setError("הזן URL")
      return
    }
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const r = await fetch("/api/admin/auditor/scan/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      setScanId(j.scanId)
      setScanToken(j.scanAccessToken || null)
      await fetchStatus(j.scanId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = async () => {
    if (!scanId) return
    setContinueLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/admin/auditor/scan/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok && r.status !== 409) throw new Error(j?.error || `Failed (${r.status})`)
      await fetchStatus(scanId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setContinueLoading(false)
    }
  }

  const handleRefresh = () => {
    if (scanId) fetchStatus(scanId)
  }

  const handleNewScan = () => {
    setScanId(null)
    setScanToken(null)
    setStatus(null)
    setUrl("")
    setError(null)
  }

  const done = status?.status === "done" || status?.status === "failed"
  const reportPublic = status?.report_public as Record<string, unknown> | null | undefined
  const reportAdmin = status?.report_admin as Record<string, unknown> | null | undefined
  const scoreBreakdown = status?.score_breakdown as Record<string, unknown> | null | undefined
  const rules = (status?.rules as unknown[]) || []
  const pages = (status?.pages as unknown[]) || []
  const logs = (status?.logs as unknown[]) || []

  // Poll status when scan is in progress
  useEffect(() => {
    if (!scanId || done) return
    const t = setInterval(() => fetchStatus(scanId), 3000)
    return () => clearInterval(t)
  }, [scanId, done, fetchStatus])

  // Auto-continue: advance pipeline when scan is in progress (no manual "המשך" needed)
  useEffect(() => {
    if (!scanId || done) return
    let cancelled = false
    const run = async () => {
      try {
        const r = await fetch("/api/admin/auditor/scan/continue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scanId }),
        })
        if (cancelled) return
        if (r.status === 409) return
        const j = await r.json().catch(() => null)
        if (!r.ok && r.status !== 409) return
        await fetchStatus(scanId)
      } catch {
        // ignore
      }
    }
    const t = setInterval(run, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [scanId, done, fetchStatus])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Auditor – כלי סריקת אתרים</h1>
        <p className="text-muted-foreground mt-1">
          הרצת Pipeline מלא של Auditor ללא הרשמה/תשלום. הסריקה בודקת SEO, AI readiness, Schema, Tracking. דוח מלא עם חוקים והמלצות לשיפור.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          דרוש: ADMIN_AUDITOR_COMPANY_ID ב-env. הסריקה מתקדמת אוטומטית.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>התחל סריקה</CardTitle>
          <CardDescription>הזן URL ציבורי (לא localhost / IP פנימי)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={loading}
            />
            <Button onClick={handleStart} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  מתחיל...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  סריקה
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {scanId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>התקדמות</CardTitle>
                <CardDescription dir="ltr" className="font-mono text-xs">
                  {scanId}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  טען מחדש
                </Button>
                {!done && (
                  <Button size="sm" onClick={handleContinue} disabled={continueLoading}>
                    {continueLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "המשך"
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleNewScan}>
                  סריקה חדשה
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!done && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-blue-700">
                הסריקה מתקדמת אוטומטית. אין צורך ללחוץ &quot;המשך&quot;.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">סטטוס</span>
                <div className="font-medium">{String(status?.status ?? "-")}</div>
              </div>
              <div>
                <span className="text-muted-foreground">שלב</span>
                <div className="font-medium">{String(status?.step ?? "-")}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Host</span>
                <div className="font-medium truncate">{String(status?.normalized_host ?? "-")}</div>
              </div>
              {typeof status?.screenshot_url === "string" && status.screenshot_url && (
                <div>
                  <span className="text-muted-foreground">צילום מסך</span>
                  <div>
                    <img
                      src={status.screenshot_url}
                      alt="Screenshot"
                      className="mt-1 rounded border max-h-24 object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {done && scoreBreakdown && Object.keys(scoreBreakdown).length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">פירוט טכני (Admin only)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {scoreBreakdown.technical != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">Technical</span>
                      <div className="text-xl font-bold">{String(scoreBreakdown.technical)}</div>
                    </div>
                  )}
                  {scoreBreakdown.schema != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">Schema</span>
                      <div className="text-xl font-bold">{String(scoreBreakdown.schema)}</div>
                    </div>
                  )}
                  {scoreBreakdown.ai_readiness != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">AI Readiness</span>
                      <div className="text-xl font-bold">{String(scoreBreakdown.ai_readiness)}</div>
                    </div>
                  )}
                  {scoreBreakdown.tracking != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">Tracking</span>
                      <div className="text-xl font-bold">{String(scoreBreakdown.tracking)}</div>
                    </div>
                  )}
                </div>
                <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-32">
                  {JSON.stringify(scoreBreakdown, null, 2)}
                </pre>
              </div>
            )}

            {done && reportPublic && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">תוצאות (report_public)</h3>
                <div className="grid grid-cols-3 gap-4">
                  {reportPublic.score_total != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">ציון כללי</span>
                      <div className="text-2xl font-bold">{String(reportPublic.score_total)}</div>
                    </div>
                  )}
                  {reportPublic.score_search != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">חשיפה בחיפוש</span>
                      <div className="text-2xl font-bold">{String(reportPublic.score_search)}</div>
                    </div>
                  )}
                  {reportPublic.score_ai != null && (
                    <div>
                      <span className="text-muted-foreground text-sm">מוכנות AI</span>
                      <div className="text-2xl font-bold">{String(reportPublic.score_ai)}</div>
                    </div>
                  )}
                </div>
                {Array.isArray(reportPublic.issues_overview) && reportPublic.issues_overview.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm font-medium">המלצות עיקריות לשיפור SEO ו-AI</span>
                    <ul className="mt-2 list-disc pr-5 space-y-2">
                      {reportPublic.issues_overview.map((x: unknown, i: number) => (
                        <li key={i} className="text-sm">{String(x)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {reportPublic.category_scores != null && typeof reportPublic.category_scores === "object" ? (
                  <div>
                    <span className="text-muted-foreground text-sm">ציוני קטגוריות</span>
                    <pre className="mt-2 p-3 rounded bg-muted text-xs overflow-auto max-h-40">
                      {JSON.stringify(reportPublic.category_scores, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}

            {done && reportAdmin && Object.keys(reportAdmin).length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">דוח מלא (report_admin)</h3>
                {reportAdmin.coverage && typeof reportAdmin.coverage === "object" && (
                  <div className="text-sm text-muted-foreground">
                    כיסוי: {(reportAdmin.coverage as any).extracted_pages ?? "-"} עמודים מחולצים מתוך {(reportAdmin.coverage as any).total_pages ?? "-"}
                  </div>
                )}
                {reportAdmin.confidence && typeof reportAdmin.confidence === "object" && (
                  <div className="text-sm">
                    רמת ביטחון: {(reportAdmin.confidence as any).level ?? "-"}
                    {(reportAdmin.confidence as any).warning && (
                      <span className="text-amber-600 mr-2"> • {(reportAdmin.confidence as any).warning}</span>
                    )}
                  </div>
                )}
                <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-96">
                  {JSON.stringify(reportAdmin, null, 2)}
                </pre>
              </div>
            )}

            {done && rules.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">חוקים והמלצות ({rules.length})</h3>
                <p className="text-sm text-muted-foreground">כל חוק כולל המלצה לשיפור SEO/AI</p>
                <div className="space-y-3 max-h-96 overflow-auto">
                  {rules.map((r: any, i: number) => (
                    <div key={i} className="rounded-lg border p-3 text-sm bg-card">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{String(r.rule_key ?? "-")}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            r.status === "pass" ? "bg-green-500/20 text-green-700" : r.status === "warn" ? "bg-amber-500/20 text-amber-700" : "bg-red-500/20 text-red-700"
                          }`}
                        >
                          {String(r.status ?? "-")}
                        </span>
                        <span className="text-muted-foreground">מאמץ: {String(r.effort ?? "-")}</span>
                        <span className="text-muted-foreground">השפעה: {String(r.impact ?? "-")}</span>
                      </div>
                      {r.recommendation_he && <div className="mt-2 font-medium">{String(r.recommendation_he)}</div>}
                      {r.evidence && typeof r.evidence === "object" && Object.keys(r.evidence).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-muted-foreground text-xs">ראיות</summary>
                          <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-auto">{JSON.stringify(r.evidence, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {done && pages.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">עמודים ({pages.length})</h3>
                <div className="space-y-1 max-h-40 overflow-auto text-xs">
                  {pages.slice(0, 15).map((p: any, i: number) => (
                    <div key={i} className="truncate">
                      <span className="text-muted-foreground">{String(p.status_code ?? "-")}</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono">{String(p.url ?? p.path ?? "-")}</span>
                    </div>
                  ))}
                  {pages.length > 15 && <div className="text-muted-foreground">... ועוד {pages.length - 15}</div>}
                </div>
              </div>
            )}

            {done && logs.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">לוגים ({logs.length})</h3>
                <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-48">
                  {logs.slice(-30).map((l: any) => `[${l?.ts ?? ""}] ${l?.level ?? ""}: ${l?.message ?? ""}`).join("\n")}
                </pre>
              </div>
            )}

            {done && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">המלצות לשיפור הסריקה והאינדוקס</h3>
                <ul className="list-disc pr-5 space-y-1 text-sm text-muted-foreground">
                  <li>ודא ש-sitemap.xml קיים ונגיש – משפר את כיסוי העמודים</li>
                  <li>robots.txt לא חוסם – מאפשר סריקה למנועי חיפוש ו-AI</li>
                  <li>הוסף llms.txt – משפר מוכנות AI וקריאות לכלים אוטומטיים</li>
                  <li>Schema.org (JSON-LD) – Organization, WebSite, FAQPage</li>
                  <li>תגיות Open Graph + Twitter – שיפור תצוגה ברשתות</li>
                  <li>כותרות H1-H6 עקביות – מבנה ברור לעמודים</li>
                  <li>alt לתמונות – נגישות ו-SEO</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
