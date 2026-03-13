import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"
import { AuditorSuccessClient } from "@/components/auditor/AuditorSuccessClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function EnAuditorSuccessPage({
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
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (typeof value === "string" && value.trim()) params.set(key, value)
    }
    const returnTo = params.toString() ? `/en/auditor/success?${params.toString()}` : "/en/auditor/success"
    redirect(`/en/auditor/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return <AuditorSuccessClient basePath="/en/auditor" />
}
