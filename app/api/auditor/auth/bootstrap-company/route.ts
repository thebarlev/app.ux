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

function firstNameFromFullName(fullName: string): string {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts[0] || "לקוח"
}

export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const email = String(user.email || "").trim().toLowerCase()
  if (!email) return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 })

  const admin = createServiceRoleClient()

  // If user already has a company via direct owner field, return it.
  const { data: existingDirect } = await admin.from("companies").select("id").eq("auth_user_id", user.id).maybeSingle()
  if (existingDirect?.id) return NextResponse.json({ ok: true, company_id: String(existingDirect.id), reused: true })

  // Or via membership.
  const { data: existingMember } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()
  if (existingMember?.company_id) return NextResponse.json({ ok: true, company_id: String(existingMember.company_id), reused: true })

  const fullName = String(parsed.data.full_name || "").trim()
  const phone = String(parsed.data.phone || "").trim()
  const firstName = firstNameFromFullName(fullName)

  // Minimal company creation for Auditor (no business-profile step).
  // Keep to columns we already use in auditor billing indicator flow.
  const { data: insertedCompany, error: insErr } = await admin
    .from("companies")
    .insert({
      company_name: `Auditor – ${fullName || firstName}`,
      business_type: "other",
      tax_id: null,
      contact_first_name: firstName,
      contact_full_name: fullName || firstName,
      email,
      mobile_phone: phone || null,
      status: "active",
      auth_user_id: user.id,
    } as any)
    .select("id")
    .single()

  if (insErr || !insertedCompany?.id) {
    // Race: someone else created it by email (companies.email unique in this repo)
    const { data: again } = await admin.from("companies").select("id").eq("email", email).maybeSingle()
    if (!again?.id) return NextResponse.json({ ok: false, error: "Failed to create company" }, { status: 500 })
    return NextResponse.json({ ok: true, company_id: String(again.id), reused: true })
  }

  const companyId = String(insertedCompany.id)

  // Ensure membership exists (best-effort; schema may vary)
  const nowIso = new Date().toISOString()
  try {
    const { error: memberErr } = await admin.from("company_members").insert({
      company_id: companyId,
      user_id: user.id,
      role: "owner",
      accepted_at: nowIso,
    } as any)
    if (memberErr && String((memberErr as any)?.code || "") === "PGRST204") {
      await admin.from("company_members").insert({ company_id: companyId, user_id: user.id, role: "owner" } as any)
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, company_id: companyId })
}

