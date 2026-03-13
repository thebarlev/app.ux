export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"
import { z } from "zod"

const updateSchema = z.object({
  company_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  mobile_phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  website: z.string().max(200).optional(),
  contact_name: z.string().max(200).optional(),
})

export async function GET() {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  let companyId: string
  try {
    companyId = await getCompanyIdForUser()
  } catch {
    return NextResponse.json({ ok: false, error: "No company" }, { status: 400 })
  }

  const { data: company, error } = await supabase
    .from("companies")
    .select("company_name, phone, mobile_phone, address, website, contact_full_name, email")
    .eq("id", companyId)
    .single()

  if (error || !company) {
    return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    full_name: String((auth.user.user_metadata as any)?.full_name || company.contact_full_name || ""),
    email: auth.user.email || company.email || "",
    company_name: company.company_name || "",
    phone: company.phone || "",
    mobile_phone: company.mobile_phone || "",
    address: (company as any).address || "",
    website: (company as any).website || "",
    contact_name: (company as any).contact_full_name || "",
  })
}

export async function PATCH(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  let companyId: string
  try {
    companyId = await getCompanyIdForUser()
  } catch {
    return NextResponse.json({ ok: false, error: "No company" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  const updates: Record<string, string> = {}
  if (parsed.data.company_name !== undefined) updates.company_name = parsed.data.company_name.trim()
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone.trim()
  if (parsed.data.mobile_phone !== undefined) updates.mobile_phone = parsed.data.mobile_phone.trim()
  if (parsed.data.address !== undefined) updates.address = parsed.data.address.trim()
  if (parsed.data.website !== undefined) updates.website = parsed.data.website.trim()
  if (parsed.data.contact_name !== undefined) {
    const nextContact = parsed.data.contact_name.trim()
    updates.contact_full_name = nextContact
    if (nextContact) updates.contact_first_name = nextContact.split(/\s+/)[0] || nextContact
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from("companies").update(updates).eq("id", companyId)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
