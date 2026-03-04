export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"

const bodySchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(5).max(50),
})

/**
 * Step 1: Create/upsert auditor_leads by email.
 * Called after signUp. Does NOT create company or customer.
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

  const { data: existing } = await admin
    .from("auditor_leads")
    .select("id")
    .ilike("email", email)
    .in("status", ["lead_created", "step1_completed", "step2_completed", "checkout_started", "abandoned"])
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error: updErr } = await admin
      .from("auditor_leads")
      .update({
        full_name: parsed.data.full_name.trim(),
        phone: parsed.data.phone.trim(),
        status: "step1_completed",
        last_step: "step1",
      } as any)
      .eq("id", existing.id)
    if (updErr) return NextResponse.json({ ok: false, error: "Failed to update lead" }, { status: 500 })
    return NextResponse.json({ ok: true, lead_id: existing.id })
  }

  const { data: inserted, error: insErr } = await admin
    .from("auditor_leads")
    .insert({
      full_name: parsed.data.full_name.trim(),
      email,
      phone: parsed.data.phone.trim(),
      status: "step1_completed",
      last_step: "step1",
      target_url: null,
      normalized_host: null,
      consent_terms: true,
      consent_contact: true,
    } as any)
    .select("id")
    .single()

  if (insErr) {
    if (String((insErr as any)?.code || "") === "23505") {
      const { data: again } = await admin.from("auditor_leads").select("id").ilike("email", email).limit(1).maybeSingle()
      if (again?.id) return NextResponse.json({ ok: true, lead_id: again.id })
    }
    return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, lead_id: inserted?.id })
}
