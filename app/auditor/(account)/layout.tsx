import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AuditorDashboardLayout } from "@/components/layout/AuditorDashboardLayout"
import { getAuditorConfig } from "@/lib/auditor/env"

export default async function AuditorAccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auditor/login?returnTo=/auditor/dashboard")

  return <AuditorDashboardLayout>{children}</AuditorDashboardLayout>
}
