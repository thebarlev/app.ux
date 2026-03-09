import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { isSystemAdmin } from "@/lib/security/system-admin"
import { AuditorDashboardScanClient } from "@/components/auditor/AuditorDashboardScanClient"
import { EnAuditorScanResultsCard } from "@/components/auditor/EnAuditorScanResultsCard"

const BASE = "/en/auditor"

export default async function EnAuditorDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const scanId = typeof sp?.scan_id === "string" ? sp.scan_id.trim() : ""
  const token = typeof sp?.token === "string" ? sp.token.trim() : ""

  if ((scanId && !token) || (token && !scanId)) {
    redirect("/en/auditor")
  }

  if (scanId && token) {
    const headersList = await headers()
    const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000"
    const protocol = headersList.get("x-forwarded-proto") === "https" ? "https" : "http"
    const baseUrl = `${protocol}://${host}`
    const res = await fetch(`${baseUrl}/api/auditor/status?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}&locale=en`, {
      cache: "no-store",
    })
    if (!res.ok) redirect("/en/auditor")
    const scanData = await res.json().catch(() => null)
    if (!scanData?.ok) redirect("/en/auditor")
    const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() || "a_basic" : "a_basic"
    return (
      <div dir="ltr" className="space-y-6">
        <EnAuditorScanResultsCard
          scanData={scanData}
          linkId={linkId}
          scanId={scanId}
          token={token}
        />
      </div>
    )
  }

  const supabase = await createClient()
  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const first = Array.isArray(companyRows) && companyRows.length > 0 ? companyRows[0] : null
  const companyId =
    first != null
      ? typeof first === "string"
        ? first
        : (first as { company_id?: string })?.company_id ?? null
      : null
  const canViewFullReport = await isSystemAdmin()

  let lastScan: { id: string; report_public: any; normalized_host: string } | null = null
  let scans: any[] = []

  if (companyId) {
    const { data } = await supabase
      .from("auditor_scans")
      .select("id,status,step,normalized_host,created_at,finished_at,report_public")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50)
    scans = data || []
    lastScan = scans[0] && scans[0].status === "done" ? scans[0] : null
  }

  const rp = lastScan?.report_public && typeof lastScan.report_public === "object" ? lastScan.report_public : {}
  const scoreTotal = typeof rp.score_total === "number" ? rp.score_total : null
  const scoreSearch = typeof rp.score_search === "number" ? rp.score_search : null
  const scoreAi = typeof rp.score_ai === "number" ? rp.score_ai : null

  return (
    <div dir="ltr" className="space-y-6">
      <div className="space-y-4">
        <p className="text-left text-lg text-muted-foreground">
          We're improving your business visibility in AI & SEO
        </p>
        <AuditorDashboardScanClient locale="en" basePath={BASE} />
        {lastScan ? (
          <Card>
            <CardHeader className="text-left">
              <CardTitle>Last scan score</CardTitle>
              <CardDescription>{lastScan.normalized_host}</CardDescription>
            </CardHeader>
            <CardContent className="text-left">
              <div className="flex flex-wrap gap-6">
                {scoreTotal != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">Overall score</span>
                    <div className="text-2xl font-bold">{scoreTotal}</div>
                  </div>
                )}
                {scoreSearch != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">Search visibility</span>
                    <div className="text-2xl font-bold">{scoreSearch}</div>
                  </div>
                )}
                {scoreAi != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">AI readiness</span>
                    <div className="text-2xl font-bold">{scoreAi}</div>
                  </div>
                )}
              </div>
              {canViewFullReport && (
                <Link href={`${BASE}/dashboard/scan/${lastScan.id}`} className="mt-4 inline-block">
                  <Button variant="outline" size="sm">
                    View full report (Admin)
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-left">
              <p className="text-muted-foreground">No scan yet.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {!companyId ? (
        <Card>
          <CardHeader className="text-left">
            <CardTitle>No active company</CardTitle>
            <CardDescription>Sign in with an account that has an active company to view history.</CardDescription>
          </CardHeader>
        </Card>
      ) : scans.length > 0 ? (
        <Card>
          <CardHeader className="text-left">
            <CardTitle>Scan history</CardTitle>
            <CardDescription>By company</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scans.map((s: any) => {
                const sr = s.report_public && typeof s.report_public === "object" ? s.report_public : {}
                const issues = Array.isArray(sr.issues_overview_en) && sr.issues_overview_en.length > 0
                  ? sr.issues_overview_en
                  : Array.isArray(sr.issues_overview) ? sr.issues_overview : []
                return (
                  <div key={s.id} className="rounded-ui border border-border p-4 text-left" dir="ltr">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{String(s.normalized_host || "-")}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {String(s.id)}
                        </div>
                      </div>
                      <div className="text-sm">
                        <div>
                          <span className="font-medium">Status:</span> {String(s.status)} • {String(s.step)}
                        </div>
                        <div className="mt-1">
                          <span className="font-medium">Score:</span>{" "}
                          {typeof sr.score_total === "number" ? sr.score_total : "-"}
                        </div>
                      </div>
                    </div>
                    {issues.length > 0 ? (
                      <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        {issues.slice(0, 5).map((x: any, idx: number) => (
                          <li key={idx}>{String(x)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
