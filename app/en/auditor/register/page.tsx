import { createClient } from "@/lib/supabase/server"
import AuditorRegisterClient from "@/app/auditor/register/AuditorRegisterClient"
import { notFound } from "next/navigation"

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


export default async function EnAuditorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string; scanId?: string; token?: string }>
}) {
  // AUDITOR BLOCKED — first statement executed in this component.
  if (AUDITOR_BLOCKED) notFound()

  const sp = await searchParams
  const linkId = (typeof sp?.link_id === "string" ? sp.link_id.trim() : "") || "a_basic"
  const scanId = typeof sp?.scanId === "string" ? sp.scanId.trim() : ""
  const token = typeof sp?.token === "string" ? sp.token.trim() : ""

  const supabase = await createClient()

  const titleText = "Google & AI Search Optimization"
  const descriptionText = "Quick signup"
  const legalTermsText = "I agree to the terms of use, privacy policy, and service agreement"
  const marketingText = "I want to receive offers and marketing updates by email"
  const submitButtonText = "Continue to payment"
  const submitLoadingText = "Signing up…"
  const footerQuestion = "Already have an account?"
  const footerLoginLinkText = "Sign in"

  const { data: legalTermsSetting } = await supabase
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "require_legal_terms_acceptance_on_signup")
    .maybeSingle()

  const { data: marketingSetting } = await supabase
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "require_marketing_acceptance_on_signup")
    .maybeSingle()

  const requireLegalTermsRequired = legalTermsSetting?.setting_value === "true"
  const requireMarketingRequired = marketingSetting?.setting_value === "true"

  return (
    <AuditorRegisterClient
      linkId={linkId}
      scanId={scanId}
      token={token}
      titleText={titleText}
      descriptionText={descriptionText}
      legalTermsText={legalTermsText}
      marketingText={marketingText}
      submitButtonText={submitButtonText}
      submitLoadingText={submitLoadingText}
      footerQuestion={footerQuestion}
      footerLoginLinkText={footerLoginLinkText}
      requireLegalTermsRequired={requireLegalTermsRequired}
      requireMarketingRequired={requireMarketingRequired}
      basePath="/en/auditor"
      locale="en"
      labelFullName="Full name"
      labelEmail="Email"
      labelPhone="Phone"
      helperCompanyName="This is the business name that will appear on your invoice after payment."
      labelPassword="Password"
      helperPassword="Min. 8 characters"
    />
  )
}
