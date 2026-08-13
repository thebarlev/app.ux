/**
 * Appendix 4 — the "הפקת הקבצים" module: its dialog, and its printable result report.
 *
 * The spec (1.31, page 20, section 5.4) specifies both halves. This file is the server
 * half: it establishes who is asking and which businesses they may export for, then hands
 * that to the dialog. `ExportClient` runs the dialog, calls the export route and renders
 * the report from what the route returns.
 *
 * ── ⛔ THE COMPANY LIST COMES FROM THE SESSION ──────────────────────────────
 *
 * Same rule as the 2.6 report: `user_company_ids()` decides which businesses appear, so a
 * query string cannot name someone else's books. The export route re-checks with
 * `assertCompanyRoleAccess` on every call — this list is the UI, not the boundary.
 *
 * ── AND THE SPEC'S OWN AUTO-FILL RULE ──────────────────────────────────────
 *
 * Page 20: "בית העסק הנבחר (אם אין צורך בבחירה יופיע שם בית העסק באופן אוטומטי)". One
 * business shows its name with no control to operate; several get a selector. That is the
 * spec's behaviour, so it is implemented as written rather than always showing a dropdown
 * of one.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ExportClient } from "./ExportClient"

export const dynamic = "force-dynamic"

export default async function BkmvExportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?returnTo=/dashboard/regulatory/export")

  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const ids = (Array.isArray(companyRows) ? companyRows : [])
    .map((r: unknown) => (typeof r === "string" ? r : (r as { company_id?: string })?.company_id))
    .filter((v): v is string => typeof v === "string" && v.length > 0)

  let companies: Array<{ id: string; name: string; taxId: string }> = []

  if (ids.length > 0) {
    const service = createServiceRoleClient()
    const { data } = await service
      .from("companies")
      .select("id, company_name, tax_id, registration_number")
      .in("id", ids)
      .order("company_name", { ascending: true })

    companies = ((data || []) as any[]).map((c) => ({
      id: String(c.id),
      name: String(c.company_name || "").trim(),
      taxId:
        String(c.tax_id || "").trim() || String(c.registration_number || "").trim() || "",
    }))
  }

  return <ExportClient companies={companies} />
}
