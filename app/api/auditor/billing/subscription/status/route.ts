export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"

export async function GET() {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const companyId = await getCompanyIdForUser()
  const admin = createServiceRoleClient()

  const { data: sub } = await admin
    .from("auditor_subscriptions")
    .select("company_id,plan_id,status,next_billing_date,current_period_start,current_period_end,cancel_at_period_end,canceled_at")
    .eq("company_id", companyId)
    .maybeSingle()

  if (!sub) {
    return NextResponse.json({ ok: true, has_subscription: false })
  }

  // Optional: latest invoice id for customer convenience (no raw payloads)
  const { data: lastCharge } = await admin
    .from("auditor_subscription_charges")
    .select("issued_invoice_id,subscription_period_start")
    .eq("company_id", companyId)
    .eq("status", "succeeded")
    .order("subscription_period_start", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    has_subscription: true,
    plan_id: sub.plan_id,
    status: sub.status,
    next_billing_date: sub.next_billing_date,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at,
    last_invoice_id: lastCharge?.issued_invoice_id ?? null,
  })
}

