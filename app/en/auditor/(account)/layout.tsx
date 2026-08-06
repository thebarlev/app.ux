import { redirect } from "next/navigation"
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

  // The former `x-auditor-scan-guest` short-circuit is gone. It skipped the login
  // redirect entirely for anyone who sent that header, and nothing in the running
  // app ever set it: the only writer is lib/supabase/proxy.ts, reached only via
  // the root proxy.ts (a Next 15.5+ entry point) while this app runs next@14.2.24
  // with no middleware.ts. The single remaining source was therefore the inbound
  // request. The Hebrew layout at app/auditor/(account)/layout.tsx has never had
  // this branch; this now matches it.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/en/auditor/login?returnTo=/en/auditor/dashboard")

  return <AuditorDashboardLayout basePath="/en/auditor">{children}</AuditorDashboardLayout>
}
