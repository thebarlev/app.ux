import { notFound, redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export default async function AuditorDashboardScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>
}) {
  const { scanId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auditor/login?returnTo=/auditor/dashboard")

  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const companyId = Array.isArray(companyRows) ? (companyRows[0] as any)?.company_id : null
  if (!companyId) notFound()

  const admin = createServiceRoleClient()
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id,company_id,scan_access_token")
    .eq("id", scanId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (!scan?.scan_access_token) notFound()

  redirect(`/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(scan.scan_access_token)}`)
}
