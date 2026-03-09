"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"

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

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600"
  if (score >= 70) return "text-amber-600"
  return "text-red-600"
}

function scoreBgColor(score: number): string {
  if (score >= 90) return "bg-emerald-500"
  if (score >= 70) return "bg-amber-500"
  return "bg-red-500"
}

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
  const score = typeof scanData.score_total === "number" ? scanData.score_total : 0
  const top5 = (scanData.issues_overview || []).slice(0, 5)
  const checkoutUrl = `/en/auditor/checkout?link_id=${encodeURIComponent(linkId)}&scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`

  return (
    <div dir="ltr" className="space-y-6">
      <div className="space-y-4">
        <p className="text-left text-lg text-muted-foreground">
          We&apos;re improving your business visibility in AI & SEO
        </p>

        <Card className="border-[var(--primary)]/30 bg-[var(--secondary)]">
          <CardHeader className="text-left">
            <CardTitle className="text-[var(--primary)]">Audit score</CardTitle>
            <CardDescription>0–100</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-5xl font-bold ${scoreColor(score)}`}>
              {typeof scanData.score_total === "number" ? scanData.score_total : "-"}
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreBgColor(score)}`}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>Search visibility: {scanData.score_search ?? "-"}</div>
              <div>AI readiness: {scanData.score_ai ?? "-"}</div>
            </div>
          </CardContent>
        </Card>

        {top5.length > 0 && (
          <Card>
            <CardHeader className="text-left">
              <CardTitle>Top issues</CardTitle>
              <CardDescription>Prioritized by severity</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc pl-5 text-left text-sm">
                {top5.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="text-left">
            <CardTitle>Scan details</CardTitle>
            <CardDescription>Metadata</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm text-left">
              {scanData.hostname && (
                <div>
                  <dt className="text-muted-foreground">Domain</dt>
                  <dd className="font-medium">{scanData.hostname}</dd>
                </div>
              )}
              {scanData.finished_at && (
                <div>
                  <dt className="text-muted-foreground">Scan date</dt>
                  <dd className="font-medium">
                    {format(new Date(scanData.finished_at), "MMM d, yyyy")}
                  </dd>
                </div>
              )}
              {typeof scanData.pages_scanned === "number" && (
                <div>
                  <dt className="text-muted-foreground">Pages scanned</dt>
                  <dd className="font-medium">{scanData.pages_scanned}</dd>
                </div>
              )}
              {typeof scanData.issues_count === "number" && (
                <div>
                  <dt className="text-muted-foreground">Issues found</dt>
                  <dd className="font-medium">{scanData.issues_count}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3 text-left">
              <Link href={checkoutUrl}>
                <Button className="w-full sm:w-auto">Fix these issues</Button>
              </Link>
              <p className="text-sm text-muted-foreground">
                Upgrade to unlock full audit
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
