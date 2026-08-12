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
    /*
     * ⛔ OPTIONAL, AND THIS IS THE LINE THAT BROKE THE CHECKOUT.
     *
     * These were min(1) and min(5) while the client had already made both fields
     * optional. The client sent empty strings, zod rejected them, and every payment
     * failed with "לא הצלחנו לפתוח את עמוד התשלום" — Cardcom was never even contacted.
     * Two schemas describing one form, and nobody knew they had diverged until a payment
     * could not be made. tests/unit/auditor-checkout-schema-agreement.spec.ts now fails if
     * they diverge again.
     *
     * A tax document needs the ISSUER's registration number, not the buyer's. The buyer's
     * matters for one thing — reclaiming VAT — so it is offered, not demanded.
     */
    business_name: z.string().max(160).optional(),
    tax_id: z.string().max(20).optional(),
    address: z.string().max(300).optional(),
  })
  // Unknown keys are rejected rather than stripped. See the note above: this is how
  // an `amount` in the body becomes a 400 instead of a thing to remember to ignore.
  .strict()

/**
 * The base URL Cardcom will be told to call back on.
 *
 * Production is unchanged: PUBLIC_BASE_URL, the canonical domain, and nothing else.
 * The preview branch exists because Cardcom cannot reach a preview through a
 * production domain, and a preview is where the whole flow is tested.
 *
 * The condition is `VERCEL_ENV === "preview"` explicitly, and NOT "if
 * VERCEL_BRANCH_URL happens to be set". Those are different tests: the second one
 * would quietly change production behaviour the day Vercel starts exposing that
 * variable more widely, and a callback URL is not something to leave to a coincidence
 * of what is defined.
 *
 * A missing VERCEL_BRANCH_URL on a preview falls back to PUBLIC_BASE_URL with a
 * warning rather than to an empty string — a broken-but-known address is diagnosable,
 * and an empty one produces callbacks to nowhere.
 */
function resolveCallbackBaseUrl(req: Request): string {
  const strip = (s: string) => s.trim().replace(/\/+$/, "")

  if (String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview") {
    const branchUrl = String(process.env.VERCEL_BRANCH_URL || "").trim()
    if (branchUrl) return strip(branchUrl.startsWith("http") ? branchUrl : `https://${branchUrl}`)
    console.warn(
      "[AUDITOR_CHECKOUT] VERCEL_BRANCH_URL missing on a preview — falling back to PUBLIC_BASE_URL. " +
        "Cardcom callbacks will point at production and will 404 there."
    )
  }

  return getPublicBaseUrl(req)
}

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

  /*
   * One identifier field covers ח.פ, ע.מ and ת״ז — nine digits, one check digit.
   *
   * ⚠️ The checksum runs only on a value that is actually there. Empty is allowed; wrong
   * is not. Nine digits that fail the check would put a number belonging to nobody on a
   * tax document, which is worse than leaving the field blank — so a supplied value is
   * still held to the same standard it always was.
   */
  const taxIdRaw = String(body.tax_id ?? "").trim()
  const taxId = taxIdRaw ? normalizeIsraeliIdInput(taxIdRaw) : ""
  if (taxIdRaw && !isValidIsraeliId(taxId)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 })
  }

  /*
   * ── WHAT GOES ON THE COMPANY ROW WHEN THE BUYER LEFT IT BLANK ─────────────
   *
   * company_name falls back to the full name, which is a required field, so there is no
   * case where this is empty. The scanned domain was considered and rejected: a hostname
   * is not a legal entity, and null would leave a tax document with no "לכבוד" — the one
   * line a document cannot do without.
   *
   * registration_number stays null rather than an empty string. Null means "not given";
   * '' would satisfy scripts/129's coalesce(c.registration_number, c.tax_id) and win over
   * a real number stored in the neighbouring column.
   */
  const buyerCompanyName = String(body.business_name ?? "").trim() || body.full_name.trim()
  const buyerRegistrationNumber = taxId || null

  const admin = createServiceRoleClient()

  /* ── 1 · the scan pair, before anything else is touched ── */
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id, scan_access_token, lead_id, normalized_host, hostname")
    .eq("id", body.scanId)
    .maybeSingle()

  /*
   * The scan's lead_id came out null on the session even though the scan carries one.
   * Logged rather than guessed at: this prints what the row actually returns, so the
   * next run says whether the column is empty on the scan or lost between here and the
   * insert.
   */
  if (scan) {
    console.log("[AUDITOR_CHECKOUT] scan row", {
      scanId: body.scanId,
      hasLeadId: Boolean((scan as any).lead_id),
      leadIdType: typeof (scan as any).lead_id,
    })
  }

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
        company_name: buyerCompanyName,
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
        registration_number: buyerRegistrationNumber,
        /*
         * ⛔ A company created by a preview checkout is a test company.
         *
         * This was missing, and it already cost us: a form submission on the preview
         * created company 29fa2ea0 with is_test defaulting to false — an unplanned real
         * company row, in the same database production uses, carrying a charge.
         *
         * Keyed on VERCEL_ENV rather than on the checkout gate: the gate answers "may
         * the checkout run here", and this asks "is anything created here real". They
         * are the same today and will not always be — production must never mark a
         * paying customer as a test.
         */
        // NOT `=== "preview"`. Inverted on purpose: with that test, every environment
        // that is not literally preview — local, a new environment, a VERCEL_ENV that
        // failed to load — would create a REAL company. This way only an explicit
        // production creates one. The wrong direction then fails loudly, because the
        // is_test guard throws on any outbound regulatory path; the opposite direction
        // pollutes the books in silence.
        is_test: String(process.env.VERCEL_ENV || "").trim().toLowerCase() !== "production",
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

  /* ── 4 · callback URLs, pointed at the environment actually running ── */
  //
  // ⚠️ getPublicBaseUrl() prefers PUBLIC_BASE_URL over the request origin, and
  // PUBLIC_BASE_URL is https://app.uxellent.com in every scope including preview. So
  // on a preview it handed Cardcom three production URLs, and Cardcom obediently used
  // them: the success redirect 404'd, and — far worse — so did the IndicatorUrl, which
  // is how Cardcom reports the payment. A real ₪118 transaction went through on
  // 2026-08-11 and left no trace on our side at all. Cardcom recorded our own failure
  // for us: CallIndicatorResponse=404.
  //
  // This is the same trap already documented for SHAAM — "the address is not decided
  // by the variable, it is derived from PUBLIC_BASE_URL" — a different variable and a
  // different product, two weeks apart.
  //
  // Fixed here rather than in getPublicBaseUrl, which is shared with the VOW billing
  // paths: a helper used by two products does not get changed for one product's need.
  //
  // VERCEL_BRANCH_URL rather than VERCEL_URL: the branch alias always resolves to the
  // latest deployment of the branch, while a per-deployment URL stops being the one
  // we are watching the moment anybody pushes. Cardcom reports back after the buyer
  // has finished, so the address has to survive that gap.
  const publicBaseUrl = resolveCallbackBaseUrl(req)
  try {
    requirePublicCallbackUrl(req, publicBaseUrl)
  } catch (e: any) {
    console.error("[AUDITOR_CHECKOUT] callback url unusable", { message: String(e?.message || e) })
    return NextResponse.json({ ok: false, error: "misconfigured" }, { status: 500 })
  }

  /*
   * ⛔ scanId AND token, because "חזרה לדוח" on the thank-you page sent people to a NEW
   * scan.
   *
   * That link was `href="/auditor"` with nothing after it, and /auditor with no parameters
   * is step one — the URL bar. The report only exists at /auditor?scanId=…&token=…, and
   * the success page could not build that: it receives only the session id, and
   * auditor_checkout_sessions stores scan_id but no scan access token (its token_* columns
   * are the CARD token, a different thing entirely).
   *
   * So the pair has to travel, and the shape to copy was one line below all along —
   * errorUrl already carries both. The asymmetry was the bug: the failure path could
   * return you to your report and the success path could not.
   */
  const successUrl = `${publicBaseUrl}/auditor/checkout/success?scanId=${encodeURIComponent(body.scanId)}&token=${encodeURIComponent(body.token)}`
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
