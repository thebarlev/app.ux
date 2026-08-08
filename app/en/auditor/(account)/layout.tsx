import { redirect, notFound } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { AuditorDashboardLayout } from "@/components/layout/AuditorDashboardLayout"
import { getAuditorConfig } from "@/lib/auditor/env"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


export default async function EnAuditorAccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // AUDITOR BLOCKED — first statement executed in this component.
  if (AUDITOR_BLOCKED) notFound()

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
