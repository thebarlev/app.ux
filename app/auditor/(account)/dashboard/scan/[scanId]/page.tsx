import { notFound, redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isSystemAdmin } from "@/lib/security/system-admin"
import { getCurrentUserId, getCompanyIdsForUser } from "@/lib/auth/getCurrentUser"

export default async function AuditorDashboardScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>
}) {
  const { scanId } = await params
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) redirect("/auditor/login?returnTo=/auditor/dashboard")

  const isAdmin = await isSystemAdmin()
  if (!isAdmin) redirect("/auditor/dashboard")

  const companyIds = await getCompanyIdsForUser(supabase, userId)
  const companyId = companyIds[0] ?? null

  const admin = createServiceRoleClient()
  let scan: { scan_access_token: string } | null = null
  if (companyId) {
    const { data } = await admin
      .from("auditor_scans")
      .select("id,scan_access_token")
      .eq("id", scanId)
      .eq("company_id", companyId)
      .maybeSingle()
    scan = data
  }
  if (!scan?.scan_access_token) {
    const { data: anyScan } = await admin
      .from("auditor_scans")
      .select("id,scan_access_token")
      .eq("id", scanId)
      .maybeSingle()
    scan = anyScan
  }

  if (!scan?.scan_access_token) notFound()

  redirect(`/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(scan.scan_access_token)}`)
}
