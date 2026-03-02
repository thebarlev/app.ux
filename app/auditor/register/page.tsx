import { getSystemText } from "@/lib/system-texts"
import { RegistrationProvider } from "@/components/registration/registration-context"
import { RegistrationFlowClient } from "@/components/registration/registration-flow-client"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ link_id?: string }>
}) {
  const sp = await searchParams
  const linkId = typeof sp?.link_id === "string" ? sp.link_id.trim() : ""
  const loginHref = linkId ? `/auditor/login?link_id=${encodeURIComponent(linkId)}` : "/auditor/login"
  const afterCompleteRedirectTo = linkId ? `/auditor/checkout?link_id=${encodeURIComponent(linkId)}` : "/auditor/checkout"

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
    <div className="auth-scope">
      <RegistrationProvider>
        <RegistrationFlowClient
          legalTermsText={legalTermsText}
          marketingText={marketingText}
          requireLegalTermsRequired={requireLegalTermsRequired}
          requireMarketingRequired={requireMarketingRequired}
          basePath="/auditor"
          afterCompleteRedirectTo={afterCompleteRedirectTo}
          signOutBeforeRedirect={false}
        />
      </RegistrationProvider>
      {/* Force correct login link for this context (registration-flow also has a footer link). */}
      <style>{""}</style>
    </div>
  )
}

