import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorSetupClient from "./AuditorSetupClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string; scanId?: string; token?: string }>
}) {
  const sp = await searchParams
  const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() : ""
  const scanId = typeof sp?.scanId === "string" ? sp.scanId.trim() : ""
  const token = typeof sp?.token === "string" ? sp.token.trim() : ""

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const params = new URLSearchParams()
    if (linkId) params.set("link_id", linkId)
    if (scanId) params.set("scanId", scanId)
    if (token) params.set("token", token)
    const qs = params.toString()
    const loginUrl = qs ? `/auditor/login?${qs}` : "/auditor/login"
    redirect(loginUrl)
  }

  return <AuditorSetupClient linkId={linkId} scanId={scanId} token={token} />
}
