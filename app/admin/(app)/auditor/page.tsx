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

  // Poll status when scan is in progress
  useEffect(() => {
    if (!scanId || done) return
    const t = setInterval(() => fetchStatus(scanId), 3000)
    return () => clearInterval(t)
  }, [scanId, done, fetchStatus])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Auditor</h1>
        <p className="text-muted-foreground mt-1">
          הרצת Pipeline מלא של Auditor ללא הרשמה/תשלום. סריקות נשמרות תחת ADMIN_AUDITOR_COMPANY_ID.
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
                    <span className="text-muted-foreground text-sm">המלצות</span>
                    <ul className="mt-2 list-disc pr-5 space-y-1">
                      {reportPublic.issues_overview.map((x: unknown, i: number) => (
                        <li key={i}>{String(x)}</li>
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
                <h3 className="font-semibold">פירוט מלא (report_admin)</h3>
                <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-96">
                  {JSON.stringify(reportAdmin, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
