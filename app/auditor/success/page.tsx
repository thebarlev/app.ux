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

  if (!user) {
    redirect(`/auditor/login?returnTo=${encodeURIComponent("/auditor/dashboard")}`)
  }

  redirect("/auditor/dashboard")
}
