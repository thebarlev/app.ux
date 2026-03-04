/**
 * Process a Cardcom indicator event (heavy work).
 * Called by /api/auditor/billing/process-pending - NOT by the indicator itself.
 * The indicator must return 200 quickly; this runs async.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { extractTokenFromIndicator, normalizeCardcomTokenExDate, pullLowProfileIndicator } from "@/lib/auditor/billing/cardcom"
import { encryptToken, tokenHashSha256 } from "@/lib/auditor/billing/tokenCrypto"
import { computeMonthlyPeriod } from "@/lib/auditor/billing/period"
import { uniqAsmachtaAuditor } from "@/lib/auditor/billing/uniqAsmachta"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { ensureAuditorCustomerCompanyForUser } from "@/lib/auditor/billing/ensure-customer-company"

const providerKey = "cardcom"

function getFirstFromQuery(query: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = query[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function looksLikeUuid(v: string | null | undefined): boolean {
  const s = String(v || "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export type ProcessResult = { ok: boolean; error?: string; paid?: boolean }

export async function processCardcomIndicatorEvent(
  admin: SupabaseClient,
  eventId: string,
  payload: { query?: Record<string, string> }
): Promise<ProcessResult> {
  const query = payload?.query || {}
  const lowProfileCode =
    getFirstFromQuery(query, ["lowprofilecode", "LowProfileCode", "lowProfileCode"]) || null
  const returnValue = getFirstFromQuery(query, ["ReturnValue", "returnvalue", "returnValue"])

  if (!lowProfileCode) {
    return { ok: false, error: "missing_lowprofilecode" }
  }

  // Pull authoritative indicator from Cardcom
  let indicatorParsed: Record<string, any>
  let paid = false
  let internalDealNumber: string | null = null
  try {
    const pulled = await pullLowProfileIndicator(lowProfileCode)
    indicatorParsed = pulled.parsed
    paid = pulled.paid
    internalDealNumber = pulled.internalDealNumber
  } catch (e) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "pull_failed" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return { ok: true, paid: false, error: "pull_failed" }
  }

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
    return { ok: true, paid: false, error: "checkout_not_found" }
  }

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
    return { ok: true, paid: false }
  }

  const tokenInfo = extractTokenFromIndicator(indicatorParsed)
  if (!tokenInfo?.token) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "token_missing" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return { ok: true, paid: true, error: "token_missing" }
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
    return { ok: true, paid: true, error: "plan_missing" }
  }

  let companyId: string | null = checkout.company_id ? String(checkout.company_id) : null
  let userId: string | null = checkout.user_id ? String(checkout.user_id) : null

  // Resolve userId from lead email when checkout.user_id is null (e.g. existing user, inviteUserByEmail failed)
  // Use small page + timeout to avoid Vercel 300s limit; repair API can fix if we miss
  if (!userId) {
    const { data: leadForUser } = await admin
      .from("auditor_leads")
      .select("email")
      .eq("id", String(checkout.lead_id || ""))
      .maybeSingle()
    const leadEmailForUser = String((leadForUser as any)?.email || "").trim().toLowerCase()
    if (leadEmailForUser) {
      try {
        const listPromise = (admin as any).auth.admin.listUsers({ perPage: 100 })
        const timeoutPromise = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))
        const { data } = await Promise.race([listPromise, timeoutPromise]) as { data?: { users?: any[] } }
        const match = data?.users?.find((u: any) => String(u?.email || "").toLowerCase() === leadEmailForUser)
        if (match?.id) userId = String(match.id)
      } catch {
        /* ignore - repair API can fix */
      }
    }
  }

  if (!companyId) {
    const { data: lead } = await admin
      .from("auditor_leads")
      .select("id,full_name,email,phone,normalized_host,website_url,keyword_1,keyword_2,keyword_3,business_type,seo_goal,region_type,region_value")
      .eq("id", String(checkout.lead_id))
      .maybeSingle()

    if (!lead?.id) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "lead_missing" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return { ok: true, paid: true, error: "lead_missing" }
    }

    const leadEmail = String((lead as any).email || "").trim()
    const leadName = String((lead as any).full_name || "").trim()
    const leadPhone = String((lead as any).phone || "").trim()
    const normalizedHost = String((lead as any).normalized_host || "").trim()
    const websiteUrl = String((lead as any).website_url || "").trim()

    if (!leadEmail) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "lead_email_missing" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return { ok: true, paid: true, error: "lead_email_missing" }
    }

    const ensureResult = await ensureAuditorCustomerCompanyForUser(admin, {
      userId,
      leadId: String((lead as any).id),
      email: leadEmail,
      fullName: leadName,
      phone: leadPhone,
      normalizedHost,
      websiteUrl,
    })

    if (!ensureResult.ok) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: ensureResult.error } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return { ok: true, paid: true, error: ensureResult.error }
    }

    companyId = ensureResult.companyId

    try {
      await admin.from("auditor_leads").update({ company_id: companyId } as any).eq("id", String((lead as any).id))
    } catch {
      /* ignore */
    }
    try {
      await admin.from("auditor_checkout_sessions").update({ company_id: companyId } as any).eq("id", String(checkout.id))
    } catch {
      /* ignore */
    }

    if (userId) {
      try {
        await admin.from("auditor_checkout_sessions").update({ user_id: userId } as any).eq("id", String(checkout.id))
      } catch {
        /* ignore */
      }
    }

    const billingCfg = getAuditorBillingConfig()
    const base =
      String(billingCfg.publicBaseUrl || process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    const redirectTo = base ? `${base}/auditor/dashboard` : "/auditor/dashboard"
    let invitedUserId: string | null = null
    try {
      const invPromise = (admin as any).auth.admin.inviteUserByEmail(leadEmail, {
        data: { full_name: leadName || null },
        redirectTo,
      })
      const inv = await Promise.race([invPromise, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))])
      invitedUserId = inv?.data?.user?.id ? String(inv.data.user.id) : null
    } catch {
      invitedUserId = null
    }

    if (invitedUserId && !userId) {
      userId = invitedUserId
      try {
        await admin.from("companies").update({ auth_user_id: invitedUserId } as any).eq("id", companyId)
      } catch {
        /* ignore */
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
        /* ignore */
      }
      try {
        await admin.from("auditor_checkout_sessions").update({ user_id: invitedUserId } as any).eq("id", String(checkout.id))
      } catch {
        /* ignore */
      }
    }
  }

  if (!companyId) {
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "customer_company_failed" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return { ok: true, paid: true, error: "customer_company_failed" }
  }

  const leadId = checkout.lead_id ? String(checkout.lead_id) : null
  const now = new Date()
  const period = computeMonthlyPeriod(now)
  const nextChargeAt = period.nextBillingAt.toISOString()

  // Create auditor_customers and auditor_projects (idempotent)
  let customerId: string | null = null
  if (companyId) {
    if (leadId) {
    const { data: existingCustomer } = await admin
      .from("auditor_customers")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle()
    if (existingCustomer?.id) {
      customerId = String(existingCustomer.id)
    } else {
      const { data: newCustomer, error: custErr } = await admin
        .from("auditor_customers")
        .insert({
          lead_id: leadId,
          user_id: userId,
          company_id: companyId,
          customer_status: "active",
          last_payment_at: now.toISOString(),
          next_charge_at: nextChargeAt,
          last_charge_status: "paid",
          last_charge_error: null,
        } as any)
        .select("id")
        .single()
      if (!custErr && newCustomer?.id) customerId = String(newCustomer.id)
    }

    if (customerId) {
      const { data: existingProject } = await admin
        .from("auditor_projects")
        .select("id")
        .eq("customer_id", customerId)
        .maybeSingle()
      if (!existingProject?.id) {
        const leadData = leadId
          ? await admin.from("auditor_leads").select("website_url,keyword_1,keyword_2,keyword_3,business_type,seo_goal,region_type,region_value").eq("id", leadId).maybeSingle()
          : { data: null }
        const l = (leadData as any)?.data
        let domain: string | null = null
        if (l?.website_url) {
          try {
            domain = new URL(String(l.website_url)).hostname || null
          } catch {
            /* ignore */
          }
        }
        await admin.from("auditor_projects").insert({
          customer_id: customerId,
          domain,
          website_url: l?.website_url || null,
          keyword_1: l?.keyword_1 || null,
          keyword_2: l?.keyword_2 || null,
          keyword_3: l?.keyword_3 || null,
          business_type: l?.business_type || null,
          seo_goal: l?.seo_goal || null,
          region_type: l?.region_type || null,
          region_value: l?.region_value || null,
          status: "active",
        } as any)
      }
        await admin.from("auditor_leads").update({ status: "subscription_started" } as any).eq("id", leadId)
    }
    } else {
      const { data: existingByCompany } = await admin
        .from("auditor_customers")
        .select("id")
        .eq("company_id", companyId)
        .maybeSingle()
      if (existingByCompany?.id) customerId = String(existingByCompany.id)
      else {
        const { data: newCust } = await admin
          .from("auditor_customers")
          .insert({
            company_id: companyId,
            user_id: userId,
            customer_status: "active",
            last_payment_at: now.toISOString(),
            next_charge_at: nextChargeAt,
            last_charge_status: "paid",
          } as any)
          .select("id")
          .single()
        if (newCust?.id) customerId = String(newCust.id)
      }
    }
  }

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
  const billingCfg = getAuditorBillingConfig()

  try {
    await admin.from("auditor_subscriptions").upsert(
      {
        company_id: companyId,
        customer_id: customerId,
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
    /* keep going */
  }

  if (!companyId) {
    const errMsg = "Cannot create charge: user has no company (invariant violation)"
    console.error("[AUDITOR_PROCESS] " + errMsg, {
      checkoutId: checkout.id,
      leadId: checkout.lead_id,
      userId,
    })
    await admin
      .from("auditor_billing_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "no_company_for_charge" } } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)
    return { ok: true, paid: true, error: "no_company_for_charge" }
  }

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

  if (chargeId) {
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc("issue_auditor_charge_invoice_receipt_service", {
        p_auditor_charge_id: chargeId,
        p_issuer_company_id: billingCfg.billingAccountId,
      } as any)
      const ok = Array.isArray(rpcData) && rpcData[0]?.ok === true
      if (!ok || rpcErr) {
        console.error("[AUDITOR_PROCESS] Invoice issuance failed", {
          chargeId,
          error: rpcErr ? String((rpcErr as any)?.message || rpcErr) : "rpc returned not-ok",
        })
      }
    } catch (e: any) {
      console.error("[AUDITOR_PROCESS] Invoice issuance exception", { chargeId, error: String(e?.message || e) })
    }
  }

  console.info("[AUDITOR_PROCESS] Payment success", {
    userId,
    companyId,
    checkoutId: checkout.id,
    chargeId,
    issuerCompanyId: billingCfg.billingAccountId,
  })

  await admin
    .from("auditor_billing_events")
    .update({
      status: "ok",
      processed_at: new Date().toISOString(),
      payload: { paid: true, checkout_session_id: checkout.id, company_id: companyId, charge_id: chargeId },
    } as any)
    .eq("provider", providerKey)
    .eq("event_id", eventId)

  return { ok: true, paid: true }
}
