export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"
import { resolveCanonicalAuditorCompany } from "@/lib/auditor/company-resolution"

const bodySchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(5).max(50),
  company_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  website: z.string().max(200).optional(),
  contact_name: z.string().max(200).optional(),
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

  const canonical = await resolveCanonicalAuditorCompany(admin, { userId: user.id, email })
  if (canonical) {
    const companyId = canonical.companyId
    if (canonical.source === "auth_user_id") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by auth_user_id", { companyId })
    } else if (canonical.source === "company_members") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by company_members", { companyId })
    } else if (canonical.source === "email") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by email", { companyId })
    } else if (canonical.source === "paid_charges" || canonical.source === "paid_subscription") {
      console.log("[AUDITOR_BOOTSTRAP] canonical paid company reused", { companyId })
    } else {
      console.log("[AUDITOR_BOOTSTRAP] existing company reused", { companyId, source: canonical.source })
    }
    try {
      await admin.from("companies").update({ auth_user_id: user.id } as any).eq("id", companyId)
    } catch {
      /* ignore */
    }
    try {
      await admin.from("company_members").upsert(
        { company_id: companyId, user_id: user.id, role: "owner", accepted_at: new Date().toISOString() } as any,
        { onConflict: "company_id,user_id" }
      )
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, company_id: companyId, reused: true })
  }

  const fullName = String(parsed.data.full_name || "").trim()
  const phone = String(parsed.data.phone || "").trim()
  const firstName = firstNameFromFullName(fullName)
  const companyName = String(parsed.data.company_name || "").trim() || fullName || firstName
  const contactName = String(parsed.data.contact_name || "").trim() || fullName || firstName
  const address = String(parsed.data.address || "").trim() || null
  const website = String(parsed.data.website || "").trim() || null

  // Minimal company creation for Auditor (no business-profile step).
  // Keep to columns we already use in auditor billing indicator flow.
  const { data: insertedCompany, error: insErr } = await admin
    .from("companies")
    .insert({
      company_name: companyName,
      business_type: "other",
      tax_id: null,
      contact_first_name: firstName,
      contact_full_name: contactName,
      email,
      mobile_phone: phone || null,
      address: address || undefined,
      website: website || undefined,
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
  console.log("[AUDITOR_BOOTSTRAP] new company created as final fallback", { companyId })

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

