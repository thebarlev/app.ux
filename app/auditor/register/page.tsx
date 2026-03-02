import { createClient } from "@/lib/supabase/server"
import AuditorRegisterClient from "./AuditorRegisterClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string }>
}) {
  const sp = await searchParams
  const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() : ""

  const supabase = await createClient()

  // NOTE: For Auditor marketing flow, all strings are owned by this page (not system-texts),
  // so changes are fully controlled per product/route.
  const titleText = "הרשמה ל‑Auditor"
  const descriptionText = "השאירו פרטים כדי להמשיך לתשלום מאובטח"
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

