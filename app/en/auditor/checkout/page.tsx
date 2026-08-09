import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import AuditorCheckoutClient from "@/app/auditor/checkout/AuditorCheckoutClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


export default async function EnAuditorCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string; checkout?: string; scanId?: string; token?: string }>
}) {
  // AUDITOR BLOCKED — first statement executed in this component.
  if (AUDITOR_BLOCKED) notFound()

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
    // Redirect to register (sign up) so user can create account, then proceed to checkout.
    // Do NOT redirect to login - login is only required after payment or during account creation.
    const params = new URLSearchParams()
    if (linkId) params.set("link_id", linkId)
    if (scanId) params.set("scanId", scanId)
    if (token) params.set("token", token)
    const qs = params.toString()
    redirect(qs ? `/en/auditor/register?${qs}` : "/en/auditor/register")
  }

  return <AuditorCheckoutClient linkId={linkId} checkout={checkout} scanId={scanId} token={token} basePath="/en/auditor" />
}
