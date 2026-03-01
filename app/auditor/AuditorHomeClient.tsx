"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

type ScanRow = {
  id: string
  target_url: string
  normalized_url: string | null
  hostname: string | null
  status: string
  step: string
  score_total: number | null
  created_at: string
  finished_at: string | null
  error: string | null
}

export default function AuditorHomeClient() {
  const [url, setUrl] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [scans, setScans] = useState<ScanRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const canCreate = useMemo(() => url.trim().length > 0 && !isCreating, [url, isCreating])

  const loadScans = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const r = await fetch("/api/auditor/scans", { method: "GET" })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      setScans(Array.isArray(j?.scans) ? j.scans : [])
    } catch (e: any) {
      setLoadError(String(e?.message || e))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadScans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCreate = async () => {
    setCreateError(null)
    setIsCreating(true)
    try {
      const r = await fetch("/api/auditor/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      const scanId = String(j?.scanId || "")
      if (!scanId) throw new Error("Missing scanId")
      window.location.href = `/auditor/${scanId}`
    } catch (e: any) {
      setCreateError(String(e?.message || e))
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="text-right">
          <h1 className="text-2xl font-semibold">SEO/AEO + AI Readiness Auditor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            POC פנימי: סריקה עדינה (ללא crawl אגרסיבי), יצירת צ&apos;קליסט והמלצות בעברית.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="text-right">
          <CardTitle>סריקה חדשה</CardTitle>
          <CardDescription>הדבק URL של אתר (כולל או בלי https://)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com"
              dir="ltr"
              className="sm:flex-1"
            />
            <Button onClick={onCreate} disabled={!canCreate}>
              {isCreating ? "יוצר סריקה..." : "התחל סריקה"}
            </Button>
            <Button variant="secondary" onClick={loadScans} disabled={isLoading}>
              רענן
            </Button>
          </div>
          {createError && <div className="mt-3 text-sm text-danger text-right">{createError}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="text-right">
          <CardTitle>סריקות אחרונות</CardTitle>
          <CardDescription>רשימת סריקות עבור החברה הפעילה</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError && <div className="mb-3 text-sm text-danger text-right">{loadError}</div>}
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-right">טוען...</div>
          ) : scans.length === 0 ? (
            <div className="text-sm text-muted-foreground text-right">אין סריקות עדיין.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-right font-medium">יעד</th>
                    <th className="py-2 text-right font-medium">סטטוס</th>
                    <th className="py-2 text-right font-medium">ציון</th>
                    <th className="py-2 text-right font-medium">נוצר</th>
                    <th className="py-2 text-right font-medium">קישור</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="py-2 text-right">
                        <div className="font-medium">{s.hostname || s.target_url}</div>
                        <div className="text-xs text-muted-foreground break-all" dir="ltr">
                          {s.target_url}
                        </div>
                        {s.error ? <div className="text-xs text-danger mt-1">{s.error}</div> : null}
                      </td>
                      <td className="py-2 text-right">
                        <div className="font-medium">{s.status}</div>
                        <div className="text-xs text-muted-foreground">{s.step}</div>
                      </td>
                      <td className="py-2 text-right">{typeof s.score_total === "number" ? s.score_total : "-"}</td>
                      <td className="py-2 text-right">{new Date(s.created_at).toLocaleString()}</td>
                      <td className="py-2 text-right">
                        <Link href={`/auditor/${s.id}`} className="underline underline-offset-4">
                          פתח
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

