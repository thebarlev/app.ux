import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFirstCompanyIdForAuditor } from "@/lib/auditor/company"
import AuditorOnboardingClient, { type AuditorIntakeFormData } from "./AuditorOnboardingClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function emptyForm(): AuditorIntakeFormData {
  return {
    company_name: "",
    website: "",
    business_age: "",
    seo_done_before: false,
    google_ads_before: false,
    keywords: "",
    competitors: ["", "", "", "", ""],
    country: "",
    languages: "",
    ga_status: "",
    gsc_status: "",
    gtm_status: "",
    website_access: "",
  }
}

export default async function AuditorOnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auditor/login?returnTo=/auditor/onboarding")

  const companyId = await getFirstCompanyIdForAuditor(supabase as any)
  if (!companyId) redirect("/auditor/dashboard")

  const [{ data: intake }, { data: company }] = await Promise.all([
    supabase
      .from("auditor_client_intake")
      .select(
        "company_name, website, business_age, seo_done_before, google_ads_before, keywords, competitors, country, languages, ga_status, gsc_status, gtm_status, website_access"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("companies").select("company_name").eq("id", companyId).maybeSingle(),
  ])

  const competitorLines = String(intake?.competitors || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)

  while (competitorLines.length < 5) {
    competitorLines.push("")
  }

  const initialData: AuditorIntakeFormData = {
    ...emptyForm(),
    company_name: String(intake?.company_name || company?.company_name || ""),
    website: String(intake?.website || ""),
    business_age: String(intake?.business_age || ""),
    seo_done_before: !!intake?.seo_done_before,
    google_ads_before: !!intake?.google_ads_before,
    keywords: String(intake?.keywords || ""),
    competitors: competitorLines,
    country: String(intake?.country || ""),
    languages: String(intake?.languages || ""),
    ga_status: String(intake?.ga_status || ""),
    gsc_status: String(intake?.gsc_status || ""),
    gtm_status: String(intake?.gtm_status || ""),
    website_access: String(intake?.website_access || ""),
  }

  return <AuditorOnboardingClient initialData={initialData} />
}
