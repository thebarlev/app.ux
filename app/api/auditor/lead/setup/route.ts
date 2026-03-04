export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"

const bodySchema = z.object({
  website_url: z.string().max(2000).optional(),
  keyword_1: z.string().max(200).optional(),
  keyword_2: z.string().max(200).optional(),
  keyword_3: z.string().max(200).optional(),
  business_type: z.string().max(100).optional(),
  seo_goal: z.string().max(500).optional(),
  region_type: z.string().max(50).optional(),
  region_value: z.string().max(200).optional(),
  marketing: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Step 2: Update auditor_leads with SEO/business info.
 * Lead identified by authenticated user's email.
 */
export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const email = String(auth.user.email || "").trim().toLowerCase()
  if (!email) return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const admin = createServiceRoleClient()

  const { data: lead } = await admin
    .from("auditor_leads")
    .select("id")
    .ilike("email", email)
    .in("status", ["step1_completed", "step2_completed", "checkout_started"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lead?.id) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 })

  const update: Record<string, unknown> = {
    status: "step2_completed",
    last_step: "step2",
  }
  if (parsed.data.website_url != null) update.website_url = parsed.data.website_url
  if (parsed.data.keyword_1 != null) update.keyword_1 = parsed.data.keyword_1
  if (parsed.data.keyword_2 != null) update.keyword_2 = parsed.data.keyword_2
  if (parsed.data.keyword_3 != null) update.keyword_3 = parsed.data.keyword_3
  if (parsed.data.business_type != null) update.business_type = parsed.data.business_type
  if (parsed.data.seo_goal != null) update.seo_goal = parsed.data.seo_goal
  if (parsed.data.region_type != null) update.region_type = parsed.data.region_type
  if (parsed.data.region_value != null) update.region_value = parsed.data.region_value
  if (parsed.data.marketing != null) update.marketing = parsed.data.marketing

  const { error } = await admin.from("auditor_leads").update(update as any).eq("id", lead.id)

  if (error) return NextResponse.json({ ok: false, error: "Failed to update lead" }, { status: 500 })

  return NextResponse.json({ ok: true, lead_id: lead.id })
}
