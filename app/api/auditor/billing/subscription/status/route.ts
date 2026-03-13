export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"
import { isSystemAdmin } from "@/lib/security/system-admin"

const VOW_BILLING_COMPANY_ID = "4ae68334-15a0-4fa3-a9ba-fd77deccc95d"

export async function GET() {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const companyId = await getCompanyIdForUser()
  const admin = createServiceRoleClient()

  const isAdmin = await isSystemAdmin()
  const isVowBillingCompany = companyId === VOW_BILLING_COMPANY_ID
  if (isAdmin || isVowBillingCompany) {
    return NextResponse.json({
      ok: true,
      has_subscription: true,
      plan_id: "pro",
      status: "active",
      next_billing_date: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      last_invoice_id: null,
      purchase: null,
    })
  }

  const { data: sub } = await admin
    .from("auditor_subscriptions")
    .select(
      "company_id,plan_id,status,next_billing_date,current_period_start,current_period_end,cancel_at_period_end,canceled_at,plan_snapshot_monthly_amount,plan_snapshot_currency"
    )
    .eq("company_id", companyId)
    .maybeSingle()

  if (!sub) {
    return NextResponse.json({ ok: true, has_subscription: false })
  }

  // Optional: latest invoice id for customer convenience (no raw payloads)
  const { data: lastCharge } = await admin
    .from("auditor_subscription_charges")
    .select("issued_invoice_id,subscription_period_start,amount,currency,provider_internal_deal_number")
    .eq("company_id", companyId)
    .eq("status", "succeeded")
    .order("subscription_period_start", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: lastPaidCheckout } = await admin
    .from("auditor_checkout_sessions")
    .select("id,provider_internal_deal_number,created_at")
    .eq("company_id", companyId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const chargeAmount = Number((lastCharge as any)?.amount ?? NaN)
  const snapshotAmount = Number((sub as any)?.plan_snapshot_monthly_amount ?? NaN)
  const purchaseValue = Number.isFinite(chargeAmount)
    ? chargeAmount
    : Number.isFinite(snapshotAmount)
      ? snapshotAmount
      : null
  const purchaseCurrency =
    String((lastCharge as any)?.currency || (sub as any)?.plan_snapshot_currency || "").trim() || null
  const transactionId =
    String(
      (lastPaidCheckout as any)?.provider_internal_deal_number ||
      (lastPaidCheckout as any)?.id ||
      (lastCharge as any)?.provider_internal_deal_number ||
      ""
    ).trim() || null
  const checkoutSessionId = String((lastPaidCheckout as any)?.id || "").trim() || null

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
    purchase:
      purchaseValue !== null && purchaseCurrency
        ? {
            transaction_id: transactionId,
            checkout_session_id: checkoutSessionId,
            value: purchaseValue,
            currency: purchaseCurrency,
            plan: sub.plan_id,
          }
        : null,
  })
}

