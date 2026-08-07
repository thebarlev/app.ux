import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { AuditorDashboardLayout } from "@/components/layout/AuditorDashboardLayout"
import { getAuditorConfig } from "@/lib/auditor/env"

export default async function EnAuditorAccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return null

  const headersList = await headers()
  const isScanGuest = headersList.get("x-auditor-scan-guest") === "1"
  if (isScanGuest) {
    return <AuditorDashboardLayout basePath="/en/auditor">{children}</AuditorDashboardLayout>
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/en/auditor/login?returnTo=/en/auditor/dashboard")

  return <AuditorDashboardLayout basePath="/en/auditor">{children}</AuditorDashboardLayout>
}
