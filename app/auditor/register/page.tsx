import { createClient } from "@/lib/supabase/server"
import AuditorRegisterClient from "./AuditorRegisterClient"
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


export default async function AuditorRegisterPage({
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

  // NOTE: For Auditor marketing flow, all strings are owned by this page (not system-texts),
  // so changes are fully controlled per product/route.
  const titleText = "קידום עסקים במנועי AI"
  const descriptionText =" הרשמה מהירה"
  const legalTermsText = "אני מסכים/ה לתנאי השימוש, למדיניות הפרטיות, ולנספח שימוש בשירות"
  const marketingText = "אני רוצה לקבל מכם למייל הטבות ומידע שיווקי"
  const submitButtonText = "המשך לתשלום"
  const submitLoadingText = "נרשמים…"
  const footerQuestion = "כבר יש לך חשבון?"
  const footerLoginLinkText = "התחברות"

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
    />
  )
}

