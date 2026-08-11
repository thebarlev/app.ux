export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getPublicBaseUrl, openLowProfile, requirePublicCallbackUrl } from "@/lib/auditor/billing/cardcom"
import { getCardcomMarketConfig, resolveBillingMarket } from "@/lib/auditor/billing/market"
import { resolveCanonicalAuditorCompany } from "@/lib/auditor/company-resolution"
import { isCheckoutEnabled } from "@/lib/auditor/billing/checkout-gate"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { isValidIsraeliId, normalizeIsraeliIdInput } from "@/lib/validation/israeli-id"

/**
 * Opens a Cardcom payment page for a visitor who has no account.
 *
 * This replaces a version that required an authenticated user and resolved the plan
 * from a marketing link_id. Neither fits the product: there is no signup in this flow
 * by decision, and the entry point is the plans section on the results page, which
 * hands over a plan id and a scan. The link_id path was behind a hard 404 and had no
 * live caller; it is not carried over, and that is recorded rather than hidden.
 *
 * ── WHAT STANDS BETWEEN THIS ROUTE AND THE OPEN INTERNET ────────────────────
 * With no auth, three things do, and all three are here rather than in a comment:
 *
 *   1. The scan pair. scanId + token must match auditor_scans.scan_access_token
 *      exactly — the same comparison /api/auditor/status makes. A bad pair is 403,
 *      which is enforceable here even though the page above can only render a
 *      refusal at 200.
 *   2. Rate limits, by IP and then by email. Two separate buckets, because one
 *      address behind one NAT and one email across many addresses are different
 *      abuses.
 *   3. A strict body. `.strict()` is doing security work, not tidiness: an `amount`
 *      key arriving from a client would be rejected as an unknown field instead of
 *      being silently ignored, and the price is read from auditor_plans regardless.
 *
 * ── THE PRICE IS READ, NEVER RECEIVED ───────────────────────────────────────
 * auditor_plans.monthly_amount is VAT-INCLUSIVE — see the COMMENT on that column and
 * migration 130. It is what Cardcom is asked to charge and what the invoice divides
 * by 1.18. Nothing about the amount comes from the request.
 *
 * ── ABANDONMENT IS A DESIGN REQUIREMENT, NOT A TEST CASE ────────────────────
 * Most people who reach a payment page do not pay on the first visit. So a repeat
 * submit for the same company and plan REUSES the open session and re-opens Low
 * Profile against it, rather than inserting a second row. That matters twice over:
 * it is what lets someone come back, and it is why the period index added in 130
 * covers `status = 'succeeded'` only — a stuck 'created' row must never be able to
 * lock a customer out of buying.
 *
 * ── WHERE uniqAsmachtaAuditor LIVES, AND WHY NOT HERE ───────────────────────
 * This route does not create a charge; Cardcom's indicator callback does. That
 * callback already computes the asmachta with the same uniqAsmachtaAuditor the
 * renewal path uses — process-indicator-event.ts:487 — and already recovers from a
 * duplicate by selecting the existing row by uniq_asmachta. Verified, not assumed.
 * Computing one here would be a second source of truth for the same string.
 */

const bodySchema = z
  .object({
    plan_id: z.string().min(1).max(40),
    scanId: z.string().uuid(),
    token: z.string().min(8).max(200),
    full_name: z.string().min(1).max(120),
    email: z.string().email().max(320),
    phone: z.string().min(9).max(20),
    business_name: z.string().min(1).max(160),
    tax_id: z.string().min(5).max(20),
    address: z.string().max(300).optional(),
  })
  // Unknown keys are rejected rather than stripped. See the note above: this is how
  // an `amount` in the body becomes a 400 instead of a thing to remember to ignore.
  .strict()

/** 10 attempts per IP and 5 per email, per 10 minutes. */
const IP_LIMIT = 10
const EMAIL_LIMIT = 5
const WINDOW_MS = 10 * 60 * 1000

/** How long an unpaid session stays reusable. Long enough to come back from a phone. */
const SESSION_REUSE_MS = 30 * 60 * 1000

export async function POST(req: Request) {
  if (!isCheckoutEnabled()) return new NextResponse(null, { status: 404 })

  const ip = getClientIp(req)
  const byIp = rateLimit({ key: `auditor:checkout:ip:${ip}`, limit: IP_LIMIT, windowMs: WINDOW_MS })
  if (!byIp.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byIp) })
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    // The reason is logged, never returned: a validation message that names the
    // offending field is a map of the schema for anyone probing it.
    console.warn("[AUDITOR_CHECKOUT] body rejected", { ip, issues: parsed.error.issues.map((i) => i.path.join(".")) })
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 })
  }

  const body = parsed.data
  const email = body.email.trim().toLowerCase()

  const byEmail = rateLimit({ key: `auditor:checkout:email:${email}`, limit: EMAIL_LIMIT, windowMs: WINDOW_MS })
  if (!byEmail.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byEmail) })
  }

  // One identifier field covers ח.פ, ע.מ and ת״ז — nine digits, one check digit.
  const taxId = normalizeIsraeliIdInput(body.tax_id)
  if (!isValidIsraeliId(taxId)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  /* ── 1 · the scan pair, before anything else is touched ── */
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id, scan_access_token, lead_id, normalized_host, hostname")
    .eq("id", body.scanId)
    .maybeSingle()

  if (!scan || String((scan as any).scan_access_token || "") !== body.token) {
    console.warn("[AUDITOR_CHECKOUT] bad scan pair", { ip, scanId: body.scanId, scanExists: Boolean(scan) })
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
  }

  /* ── 2 · the plan, and therefore the price ── */
  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id, name, monthly_amount, currency, is_active")
    .eq("id", body.plan_id)
    .eq("is_active", true)
    .maybeSingle()

  if (!plan) return NextResponse.json({ ok: false, error: "plan_unavailable" }, { status: 404 })

  const grossAmount = Number((plan as any).monthly_amount)
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    console.error("[AUDITOR_CHECKOUT] plan has no usable price", { planId: body.plan_id })
    return NextResponse.json({ ok: false, error: "plan_unavailable" }, { status: 409 })
  }

  /* ── 3 · the company: resolve before create, always ── */
  //
  // A visitor may already be a customer of the invoicing product. Creating a second
  // company for the same business is the duplicate-company problem already recorded
  // as a blocker on the uniform-file track, and it is far easier to avoid here than
  // to merge later.
  let companyId: string
  const canonical = await resolveCanonicalAuditorCompany(admin, { email })

  if (canonical?.companyId) {
    companyId = canonical.companyId
    console.log("[AUDITOR_CHECKOUT] reusing existing company", { companyId, source: canonical.source })
  } else {
    // No auth user, by decision. auth_user_id stays null; stage 5 sends a
    // set-a-password link and bootstrap-company attaches the user then.
    const { data: created, error: createErr } = await admin
      .from("companies")
      .insert({
        company_name: body.business_name.trim(),
        contact_first_name: body.full_name.trim().split(/\s+/)[0] || body.full_name.trim(),
        contact_full_name: body.full_name.trim(),
        email,
        mobile_phone: body.phone,
        /*
         * registration_number, not tax_id or company_number — all three exist on this
         * table. This is the one register4 writes, and it is also the one the customer
         * resolver reads first: scripts/129 loads the buyer as
         * coalesce(c.registration_number, c.tax_id). Writing either of the others
         * would leave resolve_customer matching on a fallback.
         */
        registration_number: taxId,
        // Confirmed to exist — text, nullable — by the column list, rather than
        // assumed. It was held out of this insert until then: an unknown column does
        // not get ignored, it fails the whole statement, and failing here loses a sale
        // at the last step. Same lesson as migration 130's block C.
        address: body.address?.trim() || null,
      } as any)
      .select("id")
      .single()

    if (createErr || !created?.id) {
      // A unique constraint on email is the likely cause, and it means somebody else
      // won the race a moment ago. Read the winner rather than fail the sale.
      const { data: again } = await admin.from("companies").select("id").eq("email", email).maybeSingle()
      if (!again?.id) {
        console.error("[AUDITOR_CHECKOUT] company create failed", { message: createErr?.message })
        return NextResponse.json({ ok: false, error: "company_failed" }, { status: 500 })
      }
      companyId = String(again.id)
    } else {
      companyId = String(created.id)
    }
  }

  /* ── 4 · callback URLs, validated for this request's origin ── */
  const publicBaseUrl = getPublicBaseUrl(req)
  try {
    requirePublicCallbackUrl(req, publicBaseUrl)
  } catch (e: any) {
    console.error("[AUDITOR_CHECKOUT] callback url unusable", { message: String(e?.message || e) })
    return NextResponse.json({ ok: false, error: "misconfigured" }, { status: 500 })
  }

  const successUrl = `${publicBaseUrl}/auditor/checkout/success`
  const errorUrl = `${publicBaseUrl}/auditor/checkout?plan=${encodeURIComponent(body.plan_id)}&scanId=${encodeURIComponent(body.scanId)}&token=${encodeURIComponent(body.token)}`
  const indicatorUrl = `${publicBaseUrl}/api/auditor/billing/cardcom/indicator`

  const market = resolveBillingMarket(successUrl)
  const marketConfig = getCardcomMarketConfig(market, body.plan_id, grossAmount)

  /* ── 5 · reuse an open session, or create one ── */
  const reuseSince = new Date(Date.now() - SESSION_REUSE_MS).toISOString()
  const { data: existing } = await admin
    .from("auditor_checkout_sessions")
    .select("id")
    .eq("company_id", companyId)
    .eq("plan_id", body.plan_id)
    .in("status", ["created", "redirected"])
    .gte("created_at", reuseSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let sessionId: string

  if (existing?.id) {
    sessionId = String(existing.id)
  } else {
    const { data: session, error: sessionErr } = await admin
      .from("auditor_checkout_sessions")
      .insert({
        company_id: companyId,
        user_id: null,
        // Both were written as null by every previous caller. This flow knows them.
        lead_id: (scan as any).lead_id ?? null,
        scan_id: body.scanId,
        plan_id: body.plan_id,
        amount: marketConfig.amount,
        coin_id: marketConfig.coinId,
        status: "created",
        provider: "cardcom",
        success_url: successUrl,
        error_url: errorUrl,
        indicator_url: indicatorUrl,
        marketing_source: "auditor_results",
      } as any)
      .select("id")
      .single()

    if (sessionErr || !session?.id) {
      console.error("[AUDITOR_CHECKOUT] session create failed", { message: sessionErr?.message })
      return NextResponse.json({ ok: false, error: "session_failed" }, { status: 500 })
    }
    sessionId = String(session.id)
  }

  /* ── 6 · Cardcom ── */
  let opened: Awaited<ReturnType<typeof openLowProfile>>
  try {
    opened = await openLowProfile({
      amount: marketConfig.amount,
      coinId: marketConfig.coinId,
      pageLanguage: marketConfig.pageLanguage,
      successUrl,
      errorUrl,
      indicatorUrl,
      // Comes back on the callback as ReturnValue, and is what the success page reads.
      returnValue: sessionId,
    })
  } catch (e: any) {
    await admin.from("auditor_checkout_sessions").update({ status: "failed" } as any).eq("id", sessionId)
    console.error("[AUDITOR_CHECKOUT] openLowProfile threw", { message: String(e?.message || e) })
    return NextResponse.json({ ok: false, error: "provider_error" }, { status: 502 })
  }

  await admin
    .from("auditor_checkout_sessions")
    .update({
      status: opened.ok ? "redirected" : "failed",
      provider_low_profile_code: opened.lowProfileCode || null,
      raw_open_response_json: opened.parsed,
      return_value: sessionId,
      success_url: successUrl,
      error_url: errorUrl,
      indicator_url: indicatorUrl,
      amount: marketConfig.amount,
      coin_id: marketConfig.coinId,
    } as any)
    .eq("id", sessionId)

  if (!opened.ok || !opened.redirectUrl) {
    return NextResponse.json({ ok: false, error: "provider_error" }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    redirect_url: opened.redirectUrl,
    checkout_session_id: sessionId,
    reused: Boolean(existing?.id),
  })
}
