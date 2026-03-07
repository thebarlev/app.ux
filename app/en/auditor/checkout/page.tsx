import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorCheckoutClient from "@/app/auditor/checkout/AuditorCheckoutClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function EnAuditorCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string; checkout?: string; scanId?: string; token?: string }>
}) {
  const sp = await searchParams
  const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() : ""
  const checkout = typeof sp?.checkout === "string" ? sp.checkout.trim() : ""
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
    redirect(qs ? `/en/auditor/login?${qs}` : "/en/auditor/login")
  }

  return <AuditorCheckoutClient linkId={linkId} checkout={checkout} scanId={scanId} token={token} basePath="/en/auditor" />
}
