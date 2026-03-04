export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { getAuditorConfig } from "@/lib/auditor/env"
import { chargeToken, normalizeCardcomTokenExDate } from "@/lib/auditor/billing/cardcom"
import { decryptToken } from "@/lib/auditor/billing/tokenCrypto"
import { computeMonthlyPeriod, computeNextMonthlyPeriod } from "@/lib/auditor/billing/period"
import { uniqAsmachtaAuditor } from "@/lib/auditor/billing/uniqAsmachta"

function requireCronSecret(req: Request): boolean {
  const expected = getAuditorBillingConfig().cronSecret
  if (!expected) return false
  const got = req.headers.get("x-cron-secret")
  return !!got && got === expected
}

export async function POST(req: Request) {
  const auditorCfg = getAuditorConfig()
  if (!auditorCfg.enabled) return new NextResponse(null, { status: 404 })
  if (!requireCronSecret(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })

  const admin = createServiceRoleClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // Due: active OR past_due (retry) and next_billing_date reached.
  const { data: subs, error: subsErr } = await admin
    .from("auditor_subscriptions")
    .select(
      "company_id,customer_id,plan_id,payment_method_id,billing_account_id,status,current_period_start,current_period_end,next_billing_date," +
        "cancel_at_period_end,canceled_at,failed_attempts,grace_until,plan_snapshot_monthly_amount,plan_snapshot_currency"
    )
    .in("status", ["active", "past_due"])
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", nowIso)
    .limit(50)

  if (subsErr) return NextResponse.json({ ok: false, error: "Failed to list subscriptions" }, { status: 500 })

  const results: any[] = []

  async function updateCustomerStatus(
    customerId: string | null,
    updates: { customer_status: string; last_payment_at?: string; next_charge_at?: string; last_charge_status?: string; last_charge_error?: string | null }
  ) {
    if (!customerId) return
    await admin.from("auditor_customers").update(updates as any).eq("id", customerId)
  }

  for (const sub of subs || []) {
    const companyId = String((sub as any).company_id || "")
    if (!companyId) continue

    const customerId = (sub as any).customer_id ? String((sub as any).customer_id) : null
    const status = String((sub as any).status || "")
    const cancelAtPeriodEnd = Boolean((sub as any).cancel_at_period_end)
    const currentEndIso = (sub as any).current_period_end ? String((sub as any).current_period_end) : null
    const graceUntilIso = (sub as any).grace_until ? String((sub as any).grace_until) : null

    if (status === "past_due" && graceUntilIso) {
      const graceUntil = new Date(graceUntilIso)
      if (Number.isFinite(graceUntil.getTime()) && now.getTime() > graceUntil.getTime()) {
        await admin.from("auditor_subscriptions").update({ status: "blocked" } as any).eq("company_id", companyId)
        await updateCustomerStatus(customerId, { customer_status: "inactive" })
        results.push({ company_id: companyId, ok: false, reason: "grace_expired_blocked" })
        continue
      }
    }

    if (cancelAtPeriodEnd && currentEndIso) {
      const end = new Date(currentEndIso)
      if (Number.isFinite(end.getTime()) && now.getTime() >= end.getTime()) {
        await admin
          .from("auditor_subscriptions")
          .update({ status: "canceled", next_billing_date: null, canceled_at: nowIso } as any)
          .eq("company_id", companyId)
        await updateCustomerStatus(customerId, { customer_status: "canceled" })
        results.push({ company_id: companyId, ok: true, skipped: true, reason: "canceled_at_period_end" })
        continue
      }
    }

    const paymentMethodId = (sub as any).payment_method_id ? String((sub as any).payment_method_id) : null
    if (!paymentMethodId) {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)
      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: "missing_payment_method",
      })
      results.push({ company_id: companyId, ok: false, reason: "missing_payment_method" })
      continue
    }

    const { data: pm } = await admin
      .from("auditor_customer_payment_methods")
      .select("id,token_enc,token_ex_date,status")
      .eq("id", paymentMethodId)
      .maybeSingle()

    if (!pm?.id || String((pm as any).status || "") !== "active") {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)
      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: "payment_method_inactive",
      })
      results.push({ company_id: companyId, ok: false, reason: "payment_method_inactive" })
      continue
    }

    let token: string
    try {
      token = decryptToken(String((pm as any).token_enc || ""))
    } catch {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)
      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: "token_decrypt_failed",
      })
      results.push({ company_id: companyId, ok: false, reason: "token_decrypt_failed" })
      continue
    }

    const tokenEx = normalizeCardcomTokenExDate((pm as any).token_ex_date ?? null)

    // Compute the NEXT period deterministically from current_period_end when available.
    const period = currentEndIso
      ? computeNextMonthlyPeriod(new Date(currentEndIso))
      : computeMonthlyPeriod(now)

    const periodStartIso = period.start.toISOString()
    const periodEndIso = period.end.toISOString()

    const uniq = uniqAsmachtaAuditor(companyId, periodStartIso)

    // Billing math must use frozen snapshot values (do not auto-change price on plan edits).
    let amount = Number((sub as any).plan_snapshot_monthly_amount ?? NaN)
    let currency = String((sub as any).plan_snapshot_currency || "ILS")

    // Defensive fallback: if snapshot missing (should not happen), read plan table.
    if (!Number.isFinite(amount) || amount <= 0) {
      const { data: plan } = await admin
        .from("auditor_plans")
        .select("monthly_amount,currency")
        .eq("id", String((sub as any).plan_id))
        .eq("is_active", true)
        .maybeSingle()
      amount = Number((plan as any)?.monthly_amount ?? NaN)
      currency = String((plan as any)?.currency || currency || "ILS")
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)
      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: "plan_price_missing",
      })
      results.push({ company_id: companyId, ok: false, reason: "plan_price_missing" })
      continue
    }

    // Insert charge row (idempotent via uniq_asmachta unique index)
    const { data: chargeRow, error: chargeInsertErr } = await admin
      .from("auditor_subscription_charges")
      .insert({
        company_id: companyId,
        plan_id: String((sub as any).plan_id),
        subscription_period_start: periodStartIso,
        subscription_period_end: periodEndIso,
        amount,
        currency,
        uniq_asmachta: uniq,
        status: "created",
      } as any)
      .select("id,status")
      .maybeSingle()

    if (chargeInsertErr) {
      const code = (chargeInsertErr as any)?.code || ""
      if (code === "23505") {
        results.push({ company_id: companyId, ok: true, skipped: true, reason: "charge_already_exists" })
        continue
      }
      results.push({ company_id: companyId, ok: false, reason: "charge_insert_failed" })
      continue
    }

    const chargeId = chargeRow?.id ? String(chargeRow.id) : null
    if (!chargeId) continue

    // Charge Cardcom token
    let chargeResp: any = null
    try {
      chargeResp = await chargeToken({ token, tokenExDate: tokenEx, sumToBill: amount, coinId: 1, uniqAsmachta: uniq })
    } catch {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscription_charges")
        .update({ status: "failed", raw_charge_response: { error: "charge_request_failed" } } as any)
        .eq("id", chargeId)
      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)
      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: "charge_request_failed",
      })
      results.push({ company_id: companyId, ok: false, reason: "charge_request_failed" })
      continue
    }

    const responseCode = String((chargeResp?.parsed as any)?.ResponseCode ?? "")
    const internalDealNumber = String((chargeResp?.parsed as any)?.InternalDealNumber ?? "").trim() || null

    if (responseCode !== "0") {
      const graceIso = graceUntilIso || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await admin
        .from("auditor_subscription_charges")
        .update({
          status: "failed",
          provider_internal_deal_number: internalDealNumber,
          raw_charge_response: chargeResp?.parsed || { error: "charge_failed" },
        } as any)
        .eq("id", chargeId)

      await admin
        .from("auditor_subscriptions")
        .update({
          status: "past_due",
          failed_attempts: Number((sub as any).failed_attempts || 0) + 1,
          grace_until: graceIso,
        } as any)
        .eq("company_id", companyId)

      await updateCustomerStatus(customerId, {
        customer_status: "past_due",
        last_charge_status: "failed",
        last_charge_error: `charge_failed:${responseCode}`.slice(0, 100),
      })

      results.push({ company_id: companyId, ok: false, reason: "charge_failed" })
      continue
    }

    // Success: mark charge, advance subscription period to the computed boundaries.
    await admin
      .from("auditor_subscription_charges")
      .update({
        status: "succeeded",
        provider_internal_deal_number: internalDealNumber,
        raw_charge_response: chargeResp?.parsed || null,
      } as any)
      .eq("id", chargeId)

    await admin
      .from("auditor_subscriptions")
      .update({
        status: "active",
        current_period_start: periodStartIso,
        current_period_end: periodEndIso,
        next_billing_date: periodEndIso,
        failed_attempts: 0,
        grace_until: null,
      } as any)
      .eq("company_id", companyId)

    await updateCustomerStatus(customerId, {
      customer_status: "active",
      last_payment_at: nowIso,
      next_charge_at: periodEndIso,
      last_charge_status: "paid",
      last_charge_error: null,
    })

    // Issue invoice_receipt (idempotent RPC)
    try {
      await admin.rpc("issue_auditor_charge_invoice_receipt_service", {
        p_auditor_charge_id: chargeId,
        p_issuer_company_id: String((sub as any).billing_account_id),
      } as any)
    } catch {
      // Leave charge succeeded; can be repaired separately
    }

    results.push({ company_id: companyId, ok: true, charge_id: chargeId, amount })
  }

  return NextResponse.json({ ok: true, now: nowIso, processed: results.length, results })
}

