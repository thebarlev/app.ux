export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"

const intakeSchema = z.object({
  company_name: z.string().max(200).optional().default(""),
  website: z.string().max(2000).optional().default(""),
  business_age: z.string().max(100).optional().default(""),
  seo_done_before: z.boolean().optional().default(false),
  google_ads_before: z.boolean().optional().default(false),
  keywords: z.string().max(4000).optional().default(""),
  competitors: z.string().max(4000).optional().default(""),
  country: z.string().max(100).optional().default(""),
  languages: z.string().max(1000).optional().default(""),
  ga_status: z.string().max(100).optional().default(""),
  gsc_status: z.string().max(100).optional().default(""),
  gtm_status: z.string().max(100).optional().default(""),
  website_access: z.string().max(4000).optional().default(""),
})

function cleanText(value: string | undefined): string {
  return String(value || "").trim()
}

function splitCompetitors(value: string | null | undefined): string[] {
  const parts = String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
  return [...parts, "", "", "", "", ""].slice(0, 5)
}

export async function GET() {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("auditor_client_intake")
    .select(
      "company_name, website, business_age, seo_done_before, google_ads_before, keywords, competitors, country, languages, ga_status, gsc_status, gtm_status, website_access"
    )
    .eq("user_id", access.user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to load intake" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    intake: {
      company_name: cleanText(data?.company_name),
      website: cleanText(data?.website),
      business_age: cleanText(data?.business_age),
      seo_done_before: !!data?.seo_done_before,
      google_ads_before: !!data?.google_ads_before,
      keywords: cleanText(data?.keywords),
      competitors: splitCompetitors(data?.competitors),
      country: cleanText(data?.country),
      languages: cleanText(data?.languages),
      ga_status: cleanText(data?.ga_status),
      gsc_status: cleanText(data?.gsc_status),
      gtm_status: cleanText(data?.gtm_status),
      website_access: cleanText(data?.website_access),
    },
  })
}

export async function POST(req: Request) {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const supabase = await createClient()
  const body = await req.json().catch(() => ({}))
  const parsed = intakeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 })
  }

  const payload = {
    user_id: access.user.id,
    company_id: access.companyId,
    company_name: cleanText(parsed.data.company_name),
    website: cleanText(parsed.data.website),
    business_age: cleanText(parsed.data.business_age),
    seo_done_before: !!parsed.data.seo_done_before,
    google_ads_before: !!parsed.data.google_ads_before,
    keywords: cleanText(parsed.data.keywords),
    competitors: cleanText(parsed.data.competitors),
    country: cleanText(parsed.data.country),
    languages: cleanText(parsed.data.languages),
    ga_status: cleanText(parsed.data.ga_status),
    gsc_status: cleanText(parsed.data.gsc_status),
    gtm_status: cleanText(parsed.data.gtm_status),
    website_access: cleanText(parsed.data.website_access),
  }

  const { data, error } = await supabase
    .from("auditor_client_intake")
    .upsert(payload, { onConflict: "user_id" })
    .select("id")
    .single()

  if (error || !data?.id) {
    console.error("[auditor] failed to save intake", { message: error?.message, code: (error as any)?.code })
    return NextResponse.json({ ok: false, error: "Failed to save intake" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, intakeId: data.id })
}
