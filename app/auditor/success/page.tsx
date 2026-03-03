import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const scanId = typeof searchParams?.scanId === "string" ? searchParams.scanId : null
  const token = typeof searchParams?.token === "string" ? searchParams.token : null

  if (!user) {
    const returnTo = scanId && token
      ? `/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`
      : "/auditor/dashboard"
    redirect(`/auditor/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  if (scanId && token) {
    redirect(`/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`)
  }

  redirect("/auditor/dashboard")
}
