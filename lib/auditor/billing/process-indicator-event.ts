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
import { resolveCanonicalAuditorCompany } from "@/lib/auditor/company-resolution"
import { createRegistrationLog } from "@/lib/auditor/leads/createRegistrationLog"
import { sendAdminNotification } from "@/lib/email/sendAdminNotification"

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
          .select("id,lead_id,scan_id,plan_id,amount,coin_id,status,provider_low_profile_code,company_id,user_id,success_url")
          .eq("id", returnId)
          .eq("provider_low_profile_code", lowProfileCode)
          .maybeSingle()
      : { data: null as any }

  const byCode = await admin
    .from("auditor_checkout_sessions")
    .select("id,lead_id,scan_id,plan_id,amount,coin_id,status,provider_low_profile_code,company_id,user_id,success_url")
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
      return { ok: true, paid: true, error: "lead_missing" }
    }

    const leadEmail = String((lead as any).email || "").trim()
    const leadEmailNorm = leadEmail.toLowerCase()
    const leadName = String((lead as any).full_name || "").trim()
    const leadPhone = String((lead as any).phone || "").trim()
    const normalizedHost = String((lead as any).normalized_host || "").trim()

    if (!leadEmail) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "lead_email_missing" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return { ok: true, paid: true, error: "lead_email_missing" }
    }

    let resolvedUserId: string | null = null
    try {
      const { data: uid } = await admin.rpc("get_user_id_by_email", { p_email: leadEmail })
      resolvedUserId = typeof uid === "string" && uid ? uid : (uid as any)?.id ?? null
    } catch {
      /* ignore */
    }

    if (resolvedUserId) {
      const canonical = await resolveCanonicalAuditorCompany(admin, {
        userId: resolvedUserId,
        email: leadEmailNorm,
      })
      if (canonical) {
        companyId = canonical.companyId
        userId = resolvedUserId
        console.log("[AUDITOR_PROCESS] canonical company reused by auth user", { companyId, source: canonical.source })
        try {
          await admin.from("companies").update({ auth_user_id: resolvedUserId } as any).eq("id", companyId)
        } catch {
          /* ignore */
        }
        try {
          await admin.from("company_members").upsert(
            { company_id: companyId, user_id: resolvedUserId, role: "owner", accepted_at: new Date().toISOString() } as any,
            { onConflict: "company_id,user_id" }
          )
        } catch {
          /* ignore */
        }
        try {
          await admin.from("auditor_leads").update({ company_id: companyId } as any).eq("id", String((lead as any).id))
        } catch {
          /* ignore */
        }
        try {
          await admin.from("auditor_checkout_sessions").update({ company_id: companyId, user_id: resolvedUserId } as any).eq("id", String(checkout.id))
        } catch {
          /* ignore */
        }
      }
    }

    if (!companyId) {
      const canonicalByEmail = await resolveCanonicalAuditorCompany(admin, { email: leadEmailNorm })
      if (canonicalByEmail) {
        companyId = canonicalByEmail.companyId
        console.log("[AUDITOR_PROCESS] canonical company reused by email", { companyId, source: canonicalByEmail.source })
        const uidToLink = userId || resolvedUserId
        if (!uidToLink) {
          try {
            const { data: uid } = await admin.rpc("get_user_id_by_email", { p_email: leadEmail })
            const resolved = typeof uid === "string" && uid ? uid : (uid as any)?.id ?? null
            if (resolved) {
              userId = resolved
              try {
                await admin.from("companies").update({ auth_user_id: resolved } as any).eq("id", companyId)
              } catch {
                /* ignore */
              }
              try {
                await admin.from("company_members").upsert(
                  { company_id: companyId, user_id: resolved, role: "owner", accepted_at: new Date().toISOString() } as any,
                  { onConflict: "company_id,user_id" }
                )
              } catch {
                /* ignore */
              }
              try {
                await admin.from("auditor_checkout_sessions").update({ company_id: companyId, user_id: resolved } as any).eq("id", String(checkout.id))
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* ignore */
          }
        } else {
          userId = uidToLink
          try {
            await admin.from("companies").update({ auth_user_id: uidToLink } as any).eq("id", companyId)
          } catch {
            /* ignore */
          }
          try {
            await admin.from("company_members").upsert(
              { company_id: companyId, user_id: uidToLink, role: "owner", accepted_at: new Date().toISOString() } as any,
              { onConflict: "company_id,user_id" }
            )
          } catch {
            /* ignore */
          }
          try {
            await admin.from("auditor_checkout_sessions").update({ company_id: companyId, user_id: uidToLink } as any).eq("id", String(checkout.id))
          } catch {
            /* ignore */
          }
        }
        try {
          await admin.from("auditor_leads").update({ company_id: companyId } as any).eq("id", String((lead as any).id))
        } catch {
          /* ignore */
        }
      }
    }

    if (!companyId) {
      const firstName = leadName.split(/\s+/).filter(Boolean)[0] || "לקוח"
      const emailLocal = leadEmailNorm.split("@")[0] || ""
      const companyName = normalizedHost || leadName || emailLocal || "Customer"

      const { data: insertedCompany, error: insErr } = await admin
        .from("companies")
        .insert({
          company_name: companyName,
          business_type: "other",
          tax_id: null,
          contact_first_name: firstName,
          contact_full_name: leadName || firstName,
          email: leadEmailNorm,
          mobile_phone: leadPhone || null,
          status: "active",
          auth_user_id: null,
        } as any)
        .select("id")
        .single()

      if (insErr || !insertedCompany?.id) {
        const { data: again } = await admin.from("companies").select("id").eq("email", leadEmailNorm).maybeSingle()
        companyId = again?.id ? String(again.id) : null
      } else {
        companyId = String(insertedCompany.id)
        console.log("[AUDITOR_PROCESS] company inserted as final fallback", { companyId })
      }
    }

    if (!companyId) {
      await admin
        .from("auditor_billing_events")
        .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "company_create_failed" } } as any)
        .eq("provider", providerKey)
        .eq("event_id", eventId)
      return { ok: true, paid: true, error: "company_create_failed" }
    }

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

    const billingCfg = getAuditorBillingConfig()
    const base =
      String(billingCfg.publicBaseUrl || process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    const redirectTo = base ? `${base}/auditor/dashboard` : "/auditor/dashboard"
    let invitedUserId: string | null = null
    if (!userId) {
      try {
        const inv = await (admin as any).auth.admin.inviteUserByEmail(leadEmail, {
          data: { full_name: leadName || null },
          redirectTo,
        })
        invitedUserId = inv?.data?.user?.id ? String(inv.data.user.id) : null
        if (invitedUserId) {
          console.log("[AUDITOR_PROCESS] inviteUserByEmail succeeded", { leadEmail, companyId })
          // Track new registration (fire-and-forget — must not break payment flow)
          try {
            await createRegistrationLog({
              email: leadEmail,
              name: leadName || null,
              companyName: normalizedHost || leadName || null,
              website: normalizedHost || null,
              source: "cardcom_payment",
            })
          } catch (err) {
            console.error("[AUDITOR_PROCESS] registration log failed", err)
          }
          // Admin notification email (fire-and-forget — must not break payment flow)
          try {
            await sendAdminNotification({
              subject: "New Auditor Registration",
              html: `<p><strong>New Auditor user registered (via payment)</strong></p>
<ul>
  <li><strong>Email:</strong> ${leadEmail}</li>
  <li><strong>Name:</strong> ${leadName || "—"}</li>
  <li><strong>Company:</strong> ${normalizedHost || leadName || "—"}</li>
  <li><strong>Website scanned:</strong> ${normalizedHost || "—"}</li>
  <li><strong>Signup time:</strong> ${new Date().toISOString()}</li>
</ul>`,
            })
          } catch (err) {
            console.error("[AUDITOR_PROCESS] Admin email notification failed", err)
          }
        }
      } catch (invErr: any) {
        const errMsg = String(invErr?.message || invErr || "")
        const isExistingUser = /already exists|duplicate|23505|user_already_exists/i.test(errMsg)
        if (isExistingUser) {
          try {
            const { data: existing } = await admin.rpc("get_user_id_by_email", { p_email: leadEmail })
            invitedUserId =
              typeof existing === "string" && existing
                ? existing
                : (existing as any)?.id ?? null
            if (invitedUserId) {
              console.log("[AUDITOR_PROCESS] invite failed (user exists), linked existing user", {
                leadEmail,
                companyId,
              })
            }
          } catch {
            invitedUserId = null
          }
        }
        if (!invitedUserId) {
          console.warn("[AUDITOR_PROCESS] inviteUserByEmail failed, no fallback", { leadEmail, error: errMsg })
        }
      }
    }

    if (invitedUserId) {
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

  console.log("[AUDITOR_PROCESS] Company/user resolved", { checkoutId: checkout.id, companyId, userId })

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
  const now = new Date()
  const period = computeMonthlyPeriod(now)
  const billingCfg = getAuditorBillingConfig()

  const chargedAmount = Number((checkout as any).amount ?? (plan as any).monthly_amount ?? 0)
  const chargedCurrency = (checkout as any).coin_id === 2 ? "USD" : "ILS"

  try {
    await admin.from("auditor_subscriptions").upsert(
      {
        company_id: companyId,
        plan_id: plan.id,
        payment_method_id: paymentMethodId,
        billing_account_id: billingCfg.billingAccountId,
        plan_snapshot_name: plan.name,
        plan_snapshot_monthly_amount: chargedAmount,
        plan_snapshot_currency: chargedCurrency,
        plan_snapshot_created_at: now.toISOString(),
        // Added by migration 130 B1 for exactly this, and then never written — same
        // omission as the charge snapshot above. Nullable on purpose: a subscription
        // created by hand, or before this line existed, carries no scan.
        scan_id: (checkout as any)?.scan_id ?? null,
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
    console.log("[AUDITOR_PROCESS] Subscription active", { companyId, plan_id: plan.id })
  } catch (subErr: any) {
    console.error("[AUDITOR_PROCESS] Subscription upsert failed", { companyId, error: String(subErr?.message || subErr) })
    /* keep going */
  }

  const uniq = uniqAsmachtaAuditor(companyId!, period.start.toISOString())
  const insertCharge = await admin
    .from("auditor_subscription_charges")
    .insert({
      company_id: companyId,
      plan_id: plan.id,
      subscription_period_start: period.start.toISOString(),
      subscription_period_end: period.end.toISOString(),
      amount: chargedAmount,
      currency: chargedCurrency,
      uniq_asmachta: uniq,
      status: "succeeded",
      /*
       * The snapshot, and why it was missing.
       *
       * Migration 130 added plan_snapshot_name and plan_snapshot_monthly_amount to this
       * table and backfilled the 14 historical rows — so the migration looked complete
       * — but nothing updated this insert. The protection going forward, which is the
       * entire reason the columns exist, therefore never operated: the first new charge
       * was written with both null.
       *
       * The subscription upsert below always had its snapshot because those columns
       * date from 081 and the code was written alongside them. That is the whole
       * difference between the two, and it is a pattern rather than an accident — the
       * same omission left auditor_subscriptions.scan_id null.
       *
       * plan.name and chargedAmount, not a re-read of auditor_plans: the point of a
       * snapshot is the value at this moment, and re-reading would reintroduce exactly
       * the live reference it exists to freeze.
       */
      plan_snapshot_name: plan.name,
      plan_snapshot_monthly_amount: chargedAmount,
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

  /*
   * ⛔ ISSUANCE DECIDES THE EVENT'S FATE. It used to only write a log line.
   *
   * The previous shape called the RPC, logged failure to the console, and then marked
   * the event status='ok' with processed_at set — unconditionally, a few lines below.
   * So a charge could be 'succeeded', a subscription 'active', money taken, and no tax
   * document anywhere, with the event recorded as processed and therefore never retried.
   * That happened on the first live issuance.
   *
   * It is the third instance of one family found in a single day:
   *   finalize_document_with_period_guard_service — failed on every call for 81 days
   *   the scan pipeline — failed in 2.4s while the screen showed 43%
   *   this — failed and reported ok
   * A failure that is logged rather than surfaced, with the outside state left looking
   * fine. Nothing here is allowed to join it.
   *
   * Four states, and the machinery for them already existed in scripts/085 — nobody
   * had used it:
   *   received    claimable by the cron
   *   processing  claimed; auto-released after 10 minutes, with `for update skip locked`
   *   ok          a document exists. Only rpcData[0].ok === true earns this
   *   error       gave up after MAX_ISSUANCE_ATTEMPTS. A human has to look
   *
   * Three attempts, so five-minute cron passes give roughly fifteen minutes of
   * self-healing — enough for a unique-key race or a lock, and short enough that a real
   * defect reaches a person while the customer is still waiting. The counter lives in
   * payload.issuance_attempts, so no migration is needed.
   *
   * ⚠️ And `error` must not become the same failure in disguise. A silent terminal
   * state nobody queries is exactly what this block is fixing, so it logs under a
   * fixed searchable prefix, and the stage 6 admin email is required to forward every
   * one of them.
   */
  const MAX_ISSUANCE_ATTEMPTS = 3
  /*
   * ⚠️ Read from the `payload` parameter, which IS the claimed event's payload.
   *
   * This first said `(event as any)?.payload?.issuance_attempts`, and tsc accepted it —
   * because `event` resolves to the deprecated DOM global rather than being an unknown
   * name. It would have been undefined on every pass, so the counter would have reset
   * to 1 forever and the cron would have retried indefinitely: precisely the runaway
   * this limit exists to prevent, hidden behind a clean typecheck.
   */
  const priorAttempts = Number((payload as any)?.issuance_attempts ?? 0) || 0
  let issuanceOk = false
  let issuanceError: string | null = null
  let documentNumber: string | null = null

  if (chargeId) {
    const isEn = String((checkout as any)?.success_url || "").includes("/en/auditor")
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc("issue_auditor_charge_invoice_receipt_service", {
        p_auditor_charge_id: chargeId,
        p_issuer_company_id: billingCfg.billingAccountId,
        p_is_en: isEn,
      } as any)
      issuanceOk = Array.isArray(rpcData) && rpcData[0]?.ok === true && !rpcErr
      documentNumber = Array.isArray(rpcData) && rpcData[0]?.document_number ? String(rpcData[0].document_number) : null
      if (issuanceOk) {
        console.log("[AUDITOR_PROCESS] Invoice issued", { chargeId, document_number: documentNumber })
      } else {
        issuanceError = rpcErr ? String((rpcErr as any)?.message || rpcErr) : "rpc returned not-ok"
      }
    } catch (e: any) {
      issuanceError = String(e?.message || e)
    }
  } else {
    issuanceError = "no charge id"
  }

  if (!issuanceOk) {
    const attempts = priorAttempts + 1
    const giveUp = attempts >= MAX_ISSUANCE_ATTEMPTS
    console.error("[AUDITOR_ISSUANCE_FAILED]", {
      eventId,
      chargeId,
      companyId,
      attempts,
      willRetry: !giveUp,
      terminal: giveUp,
      error: issuanceError,
    })

    await admin
      .from("auditor_billing_events")
      .update({
        // Back to 'received' so claim_pending picks it up again; 'error' only once the
        // attempts are spent, and it keeps processed_at so nothing claims it after that.
        status: giveUp ? "error" : "received",
        processing_started_at: null,
        processed_at: giveUp ? new Date().toISOString() : null,
        payload: {
          paid: true,
          checkout_session_id: checkout.id,
          company_id: companyId,
          charge_id: chargeId,
          issuance_attempts: attempts,
          issuance_error: issuanceError,
        },
      } as any)
      .eq("provider", providerKey)
      .eq("event_id", eventId)

    return { ok: false, paid: true, error: giveUp ? "issuance_failed_terminal" : "issuance_failed_will_retry" }
  }

  // Reached only when a document actually exists — the failure path above returns.
  await admin
    .from("auditor_billing_events")
    .update({
      status: "ok",
      processed_at: new Date().toISOString(),
      payload: {
        paid: true,
        checkout_session_id: checkout.id,
        company_id: companyId,
        charge_id: chargeId,
        document_number: documentNumber,
      },
    } as any)
    .eq("provider", providerKey)
    .eq("event_id", eventId)

  return { ok: true, paid: true }
}
