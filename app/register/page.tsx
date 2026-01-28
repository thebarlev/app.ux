import { getSystemText } from "@/lib/system-texts"
import { RegistrationProvider } from "@/components/registration/registration-context"
import { RegistrationFlowClient } from "@/components/registration/registration-flow-client"
import { createClient } from "@/lib/supabase/server"

export default async function RegisterPage() {
  const supabase = await createClient()

  // Load registration texts from System Texts (system_texts table)
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

  // Load checkbox requirement settings from global_settings
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
    <RegistrationProvider>
      <RegistrationFlowClient 
        legalTermsText={legalTermsText}
        marketingText={marketingText}
        requireLegalTermsRequired={requireLegalTermsRequired}
        requireMarketingRequired={requireMarketingRequired}
      />
    </RegistrationProvider>
  )
}
