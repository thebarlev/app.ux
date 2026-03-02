import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorCheckoutClient from "./AuditorCheckoutClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string; checkout?: string }>
}) {
  const sp = await searchParams
  const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() : ""
  const checkout = typeof sp?.checkout === "string" ? sp.checkout.trim() : ""

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = linkId ? `/auditor/login?link_id=${encodeURIComponent(linkId)}` : "/auditor/login"
    redirect(loginUrl)
  }

  return <AuditorCheckoutClient linkId={linkId} checkout={checkout} />
}

