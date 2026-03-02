export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { extractTokenFromIndicator, normalizeCardcomTokenExDate, pullLowProfileIndicator } from "@/lib/auditor/billing/cardcom"
import { encryptToken, tokenHashSha256 } from "@/lib/auditor/billing/tokenCrypto"
import { computeMonthlyPeriod } from "@/lib/auditor/billing/period"
import { uniqAsmachtaAuditor } from "@/lib/auditor/billing/uniqAsmachta"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"

function getFirstSearchParam(url: URL, keys: string[]): string | null {
  for (const k of keys) {
    const v = url.searchParams.get(k)
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function looksLikeUuid(v: string | null | undefined): boolean {
  const s = String(v || "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export async function GET(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const url = new URL(req.url)
  const lowProfileCode =
    getFirstSearchParam(url, ["lowprofilecode", "LowProfileCode"]) || getFirstSearchParam(url, ["lowProfileCode"]) || null
  const returnValue = getFirstSearchParam(url, ["ReturnValue", "returnvalue", "returnValue"])

  // Cardcom expects HTTP 200; keep response minimal.
  if (!lowProfileCode) return NextResponse.json({ ok: true, status: "ignored", message: "Missing lowprofilecode" })

  const admin = createAdminClient()
  const providerKey = "cardcom"
  const eventId = `cardcom:indicator:${lowProfileCode}`

  // Insert idempotency marker first (do not hard-ignore duplicates; retries may be needed).
  try {
    const { error: evErr } = await admin.from("auditor_billing_events").insert({
      provider: providerKey,
      event_id: eventId,
      status: "received",
      payload: { query: Object.fromEntries(url.searchParams.entries()) },
    } as any)
    // ignore duplicates (idempotency)
    if (evErr && String((evErr as any)?.code || "") !== "23505") {
      // keep going; Cardcom retries need us to be resilient
    }
  } catch {
    // ignore
  }

  // Pull authoritative indicator from Cardcom (never trust redirect or query alone).
  let indicatorParsed: Record<string, any>
  let paid = false
  let internalDealNumber: string | null = null
  try {
    const pulled = await pullLowProfileIndicator(lowProfileCode)
    indicatorParsed = pulled.parsed
    paid = pulled.paid
    internalDealNumber = pulled.internalDealNumber
  } catch {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "pull_failed" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, status: "error" })
  }

  // Lookup checkout session: ReturnValue is untrusted → require match with stored lowprofilecode.
  const returnId = looksLikeUuid(returnValue) ? String(returnValue) : null

  const byReturn =
    returnId
      ? await admin
          .from("auditor_checkout_sessions")
          .select("id,lead_id,scan_id,plan_id,amount,coin_id,status,provider_low_profile_code,company_id,user_id")
          .eq("id", returnId)
          .eq("provider_low_profile_code", lowProfileCode)
          .maybeSingle()
      : { data: null as any }

  const byCode = await admin
    .from("auditor_checkout_sessions")
    .select("id,lead_id,scan_id,plan_id,amount,coin_id,status,provider_low_profile_code,company_id,user_id")
    .eq("provider_low_profile_code", lowProfileCode)
    .maybeSingle()

  const checkout = (byReturn as any).data || (byCode as any).data || null
  if (!checkout?.id) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "checkout_not_found" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, status: "ignored" })
  }

  // Persist provider indicator payload to session for audit/debug (service-only access).
  await admin
    .from("auditor_checkout_sessions")
    .update({
      status: paid ? "paid" : "failed",
      provider_internal_deal_number: internalDealNumber,
      raw_indicator_json: indicatorParsed,
    } as any)
    .eq("id", String(checkout.id))

  if (!paid) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "ok", processed_at: new Date().toISOString(), payload: { paid: false } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, paid: false })
  }

  const tokenInfo = extractTokenFromIndicator(indicatorParsed)
  if (!tokenInfo?.token) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "token_missing" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, paid: true })
  }

  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id,name,monthly_amount,currency,is_active")
    .eq("id", String(checkout.plan_id))
    .maybeSingle()

  if (!plan?.id) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "plan_missing" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, paid: true })
  }

  // Two flows:
  // - Auth-first marketing checkout: checkout.company_id is present (preferred).
  // - Lead-first scan checkout: checkout.company_id is null and we derive company from lead email.
  let companyId: string | null = checkout.company_id ? String(checkout.company_id) : null
  let userId: string | null = checkout.user_id ? String(checkout.user_id) : null

  if (!companyId) {
    const { data: lead } = await admin
      .from("auditor_leads")
      .select("id,full_name,email,phone,normalized_host")
      .eq("id", String(checkout.lead_id))
      .maybeSingle()

    if (!lead?.id) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "lead_missing" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return NextResponse.json({ ok: true, paid: true })
    }

    const leadEmail = String((lead as any).email || "").trim()
    const leadName = String((lead as any).full_name || "").trim()
    const leadPhone = String((lead as any).phone || "").trim()
    const normalizedHost = String((lead as any).normalized_host || "").trim()

    if (!leadEmail) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "lead_email_missing" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return NextResponse.json({ ok: true, paid: true })
    }

    // Create or reuse buyer company (companies.email is unique in this repo).
    const { data: existingCompany } = await admin.from("companies").select("id,company_name,email").eq("email", leadEmail).maybeSingle()
    companyId = existingCompany?.id ? String(existingCompany.id) : null

    if (!companyId) {
      const firstName = leadName.split(/\s+/).filter(Boolean)[0] || "לקוח"
      const companyName = normalizedHost ? normalizedHost : leadName || "Auditor customer"

      const { data: insertedCompany, error: insErr } = await admin
        .from("companies")
        .insert({
          company_name: companyName,
          business_type: "other",
          tax_id: null,
          contact_first_name: firstName,
          contact_full_name: leadName || firstName,
          email: leadEmail,
          mobile_phone: leadPhone || null,
          status: "active",
          auth_user_id: null,
        } as any)
        .select("id")
        .single()

      if (insErr || !insertedCompany?.id) {
        // Race: someone else created the company; retry select.
        const { data: again } = await admin.from("companies").select("id").eq("email", leadEmail).maybeSingle()
        companyId = again?.id ? String(again.id) : null
      } else {
        companyId = String(insertedCompany.id)
      }
    }

  if (!companyId) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "company_create_failed" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return NextResponse.json({ ok: true, paid: true })
  }

    // Attach lead + checkout session to company for internal traceability.
    try {
      await admin.from("auditor_leads").update({ company_id: companyId } as any).eq("id", String((lead as any).id))
    } catch {
      // ignore
    }
    try {
      await admin.from("auditor_checkout_sessions").update({ company_id: companyId } as any).eq("id", String(checkout.id))
    } catch {
      // ignore
    }

    // Invite (magic link) user to access dashboard; if fails, subscription is still created for the company.
    let invitedUserId: string | null = null
    try {
      const billingCfg = getAuditorBillingConfig()
      const redirectTo = `${String(billingCfg.publicBaseUrl || new URL(req.url).origin).replace(/\/+$/, "")}/auditor/dashboard`
      const inv = await (admin as any).auth.admin.inviteUserByEmail(leadEmail, {
        data: { full_name: leadName || null },
        redirectTo,
      })
      invitedUserId = inv?.data?.user?.id ? String(inv.data.user.id) : null
    } catch {
      invitedUserId = null
    }

    if (invitedUserId) {
      userId = invitedUserId
      try {
        await admin.from("companies").update({ auth_user_id: invitedUserId } as any).eq("id", companyId)
      } catch {
        // ignore
      }
      try {
        await admin.from("company_members").upsert(
          {
            company_id: companyId,
            user_id: invitedUserId,
            role: "owner",
            accepted_at: new Date().toISOString(),
          } as any,
          { onConflict: "company_id,user_id" }
        )
      } catch {
        // ignore
      }
      try {
        await admin.from("auditor_checkout_sessions").update({ user_id: invitedUserId } as any).eq("id", String(checkout.id))
      } catch {
        // ignore
      }
    }
  }

  // Store token (encrypted) + hash (unique)
  const tokenHash = tokenHashSha256(tokenInfo.token)
  const tokenEnc = encryptToken(tokenInfo.token)
  const tokenEx = normalizeCardcomTokenExDate(tokenInfo.tokenExDate)

  const { data: pmRow } = await admin
    .from("auditor_customer_payment_methods")
    .upsert(
      {
        company_id: companyId,
        user_id: userId,
        provider: "cardcom",
        token_enc: tokenEnc,
        token_hash: tokenHash,
        token_ex_date: tokenEx,
        brand: tokenInfo.brand,
        card_num_start: tokenInfo.cardNumStart,
        card_num_end: tokenInfo.cardNumEnd,
        status: "active",
      } as any,
      { onConflict: "company_id,provider,token_hash" }
    )
    .select("id")
    .maybeSingle()

  const paymentMethodId = pmRow?.id ? String(pmRow.id) : null

  // Upsert subscription (normalized monthly boundaries)
  const now = new Date()
  const period = computeMonthlyPeriod(now)
  const billingCfg = getAuditorBillingConfig()

  try {
    await admin.from("auditor_subscriptions").upsert(
      {
        company_id: companyId,
        plan_id: plan.id,
        payment_method_id: paymentMethodId,
        billing_account_id: billingCfg.billingAccountId,
        plan_snapshot_name: plan.name,
        plan_snapshot_monthly_amount: plan.monthly_amount,
        plan_snapshot_currency: plan.currency || "ILS",
        plan_snapshot_created_at: now.toISOString(),
        status: "active",
        current_period_start: period.start.toISOString(),
        current_period_end: period.end.toISOString(),
        next_billing_date: period.nextBillingAt.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        failed_attempts: 0,
        grace_until: null,
      } as any,
      { onConflict: "company_id" }
    )
  } catch {
    // keep behavior: subscription upsert failure should not break indicator 200 response
  }

  // Create succeeded initial charge (idempotent by uniq_asmachta)
  const uniq = uniqAsmachtaAuditor(companyId, period.start.toISOString())
  const insertCharge = await admin
    .from("auditor_subscription_charges")
    .insert({
      company_id: companyId,
      plan_id: plan.id,
      subscription_period_start: period.start.toISOString(),
      subscription_period_end: period.end.toISOString(),
      amount: plan.monthly_amount,
      currency: plan.currency || "ILS",
      uniq_asmachta: uniq,
      status: "succeeded",
      provider_internal_deal_number: internalDealNumber,
      raw_charge_response: { indicator: indicatorParsed },
    } as any)
    .select("id,issued_invoice_id")
    .maybeSingle()

  let chargeId: string | null = insertCharge?.data?.id ? String(insertCharge.data.id) : null
  if (!chargeId) {
    const { data: existingCharge } = await admin
      .from("auditor_subscription_charges")
      .select("id,issued_invoice_id")
      .eq("uniq_asmachta", uniq)
      .maybeSingle()
    chargeId = existingCharge?.id ? String(existingCharge.id) : null
  }

  // Issue invoice_receipt (service-only RPC). Idempotent in DB.
  if (chargeId) {
    try {
      await admin.rpc("issue_auditor_charge_invoice_receipt_service", {
        p_auditor_charge_id: chargeId,
        p_issuer_company_id: billingCfg.billingAccountId,
      } as any)
    } catch {
      // Issuance failures should not make Cardcom retry indefinitely; keep charge succeeded for later repair.
    }
  }

  await admin
    .from("auditor_billing_events")
    .update({
      status: "ok",
      processed_at: new Date().toISOString(),
      payload: { paid: true, checkout_session_id: checkout.id, company_id: companyId, charge_id: chargeId },
    } as any)
    .eq("provider", providerKey)
    .eq("event_id", eventId)

  return NextResponse.json({ ok: true, paid: true })
}

