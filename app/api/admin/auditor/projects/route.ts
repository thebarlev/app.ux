export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const { data: adminRow } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle()
  if (!adminRow?.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })

  const admin = createServiceRoleClient()

  const { data: projects, error } = await admin
    .from("auditor_projects")
    .select(
      `
      id,
      domain,
      website_url,
      status,
      created_at,
      customer_id,
      auditor_customers (
        id,
        customer_status,
        last_payment_at,
        next_charge_at,
        last_charge_status,
        last_charge_error,
        lead_id,
        auditor_leads (full_name, email, phone)
      )
    `
    )
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, projects: projects || [] })
}
