import { getSystemText } from "@/lib/system-texts"
import { createClient } from "@/lib/supabase/server"
import AuditorRegisterClient from "./AuditorRegisterClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string }>
}) {
  const supabase = await createClient()

  const legalTermsText = await getSystemText(
    "registration_legal_terms_text",
    "אני מסכים/ה לתנאי השימוש, למדיניות הפרטיות, ולנספח שימוש בשירות הפקת מסמכים דיגיטליים",
    "he",
    "registration"
  )

  const marketingText = await getSystemText(
    "registration_marketing_text",
    "אני רוצה לקבל מכם למייל הטבות ומידע שיווקי",
    "he",
    "registration"
  )

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
      legalTermsText={legalTermsText}
      marketingText={marketingText}
      requireLegalTermsRequired={requireLegalTermsRequired}
      requireMarketingRequired={requireMarketingRequired}
    />
  )
}

