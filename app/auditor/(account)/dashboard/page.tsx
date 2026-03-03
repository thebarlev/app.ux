import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function AuditorDashboardPage() {
  const supabase = await createClient()
  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const companyId = Array.isArray(companyRows) ? (companyRows[0] as any)?.company_id : null

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
    <div dir="rtl" className="space-y-6">
      <div className="space-y-4">
        <p className="text-right text-lg text-muted-foreground">
          אנחנו מתחילים לשפר את החשיפה של העסק שלך ב-AI וב-SEO
        </p>
        {lastScan ? (
          <Card>
            <CardHeader className="text-right">
              <CardTitle>ציון הסריקה האחרונה</CardTitle>
              <CardDescription>{lastScan.normalized_host}</CardDescription>
            </CardHeader>
            <CardContent className="text-right">
              <div className="flex flex-wrap gap-6">
                {scoreTotal != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">ציון כללי</span>
                    <div className="text-2xl font-bold">{scoreTotal}</div>
                  </div>
                )}
                {scoreSearch != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">חשיפה בחיפוש</span>
                    <div className="text-2xl font-bold">{scoreSearch}</div>
                  </div>
                )}
                {scoreAi != null && (
                  <div>
                    <span className="text-sm text-muted-foreground">מוכנות AI</span>
                    <div className="text-2xl font-bold">{scoreAi}</div>
                  </div>
                )}
              </div>
              <Link href={`/auditor/dashboard/scan/${lastScan.id}`} className="mt-4 inline-block">
                <Button variant="outline" size="sm">
                  צפה בדוח המלא
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-right">
              <p className="text-muted-foreground mb-4">אין סריקה עדיין.</p>
              <Link href="/auditor">
                <Button>התחל סריקה</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {!companyId ? (
        <Card>
          <CardHeader className="text-right">
            <CardTitle>אין חברה פעילה</CardTitle>
            <CardDescription>כדי לצפות בהיסטוריה, יש להתחבר לחשבון עם חברה פעילה.</CardDescription>
          </CardHeader>
        </Card>
      ) : scans.length > 0 ? (
        <Card>
          <CardHeader className="text-right">
            <CardTitle>היסטוריית סריקות</CardTitle>
            <CardDescription>לפי חברה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scans.map((s: any) => {
                const sr = s.report_public && typeof s.report_public === "object" ? s.report_public : {}
                return (
                  <div key={s.id} className="rounded-ui border border-border p-4 text-right">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{String(s.normalized_host || "-")}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {String(s.id)}
                        </div>
                      </div>
                      <div className="text-sm">
                        <div>
                          <span className="font-medium">סטטוס:</span> {String(s.status)} • {String(s.step)}
                        </div>
                        <div className="mt-1">
                          <span className="font-medium">ציון:</span>{" "}
                          {typeof sr.score_total === "number" ? sr.score_total : "-"}
                        </div>
                      </div>
                    </div>
                    {Array.isArray(sr.issues_overview) && sr.issues_overview.length > 0 ? (
                      <ul className="mt-3 list-disc pr-5 text-sm text-muted-foreground space-y-1">
                        {sr.issues_overview.slice(0, 5).map((x: any, idx: number) => (
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
