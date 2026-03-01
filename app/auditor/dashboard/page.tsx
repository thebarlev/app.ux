import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default async function AuditorDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Paid read-only: list scans by company via existing membership function.
  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const companyId = Array.isArray(companyRows) ? (companyRows[0] as any)?.company_id : null
  if (!companyId) {
    return (
      <main className="min-h-svh bg-bg px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardHeader className="text-right">
              <CardTitle>Auditor Dashboard</CardTitle>
              <CardDescription>אין חברה פעילה</CardDescription>
            </CardHeader>
            <CardContent className="text-right text-sm text-muted-foreground">
              כדי לצפות בהיסטוריה, יש להתחבר לחשבון עם חברה פעילה.
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  const { data: scans } = await supabase
    .from("auditor_scans")
    .select("id,status,step,normalized_host,created_at,finished_at,report_public")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50)

  return (
    <main className="min-h-svh bg-bg px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="text-right">
          <h1 className="text-2xl font-semibold">Auditor Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">היסטוריית סריקות (קריאה בלבד) + סטטוס התקדמות.</p>
        </div>

        <Card>
          <CardHeader className="text-right">
            <CardTitle>Scans</CardTitle>
            <CardDescription>לפי חברה</CardDescription>
          </CardHeader>
          <CardContent>
            {!scans || scans.length === 0 ? (
              <div className="text-right text-sm text-muted-foreground">אין סריקות עדיין.</div>
            ) : (
              <div className="space-y-3">
                {scans.map((s: any) => {
                  const rp = s.report_public && typeof s.report_public === "object" ? s.report_public : {}
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
                            {typeof rp.score_total === "number" ? rp.score_total : "-"}
                          </div>
                        </div>
                      </div>
                      {Array.isArray(rp.issues_overview) && rp.issues_overview.length > 0 ? (
                        <ul className="mt-3 list-disc pr-5 text-sm text-muted-foreground space-y-1">
                          {rp.issues_overview.slice(0, 5).map((x: any, idx: number) => (
                            <li key={idx}>{String(x)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

