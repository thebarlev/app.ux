export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getPublicBaseUrl, openLowProfile, requirePublicCallbackUrl } from "@/lib/auditor/billing/cardcom"
import { getCardcomMarketConfig, resolveBillingMarket } from "@/lib/auditor/billing/market"

const bodySchema = z.object({
  link_id: z.string().min(2).max(80),
  success_url: z.string().url().optional(),
  error_url: z.string().url().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  created_from_url: z.string().max(2000).optional(),
})

function safeUtmFromRequest(req: Request): Record<string, string> {
  try {
    const url = new URL(req.url)
    const out: Record<string, string> = {}
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = url.searchParams.get(k)
      if (v && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  const auditorCfg = getAuditorConfig()
  if (!auditorCfg.enabled) return new NextResponse(null, { status: 404 })

  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  const linkId = String(parsed.data.link_id || "").trim()
  const companyId = await getCompanyIdForUser()

  const admin = createServiceRoleClient()

  // Validate link_id -> plan_id (server-truth)
  const { data: linkRow } = await admin
    .from("auditor_marketing_links")
    .select("id,plan_id,is_active,source")
    .eq("id", linkId)
    .maybeSingle()

  if (!linkRow || (linkRow as any).is_active !== true) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }

  // Validate plan is active and resolve amount/currency strictly from DB
  const planId = String((linkRow as any).plan_id || "").trim()
  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id,name,monthly_amount,currency,is_active")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle()

  if (!plan) return NextResponse.json({ ok: false, error: "Plan not available" }, { status: 404 })

  const planIlsAmount = Number((plan as any).monthly_amount ?? NaN)
  if (!Number.isFinite(planIlsAmount) || planIlsAmount <= 0) {
    return NextResponse.json({ ok: false, error: "Plan price not configured" }, { status: 400 })
  }

  // Idempotency (UX): reuse a recent created/redirected session for same company+plan
  const tenMinAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: existingSession } = await admin
    .from("auditor_checkout_sessions")
    .select("id,status,provider_low_profile_code,success_url,error_url,indicator_url")
    .eq("company_id", companyId)
    .eq("plan_id", planId)
    .in("status", ["created", "redirected"])
    .gte("created_at", tenMinAgoIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Always ensure callback URLs are valid for the current request context
  const publicBaseUrl = getPublicBaseUrl(req)
  try {
    requirePublicCallbackUrl(req, publicBaseUrl)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }

  const defaultSuccessUrl = `${publicBaseUrl}/auditor/success`
  const defaultErrorUrl = `${publicBaseUrl}/auditor/checkout?checkout=error`
  const indicatorUrl = `${publicBaseUrl}/api/auditor/billing/cardcom/indicator`

  const successUrl = parsed.data.success_url ? String(parsed.data.success_url) : defaultSuccessUrl
  const errorUrl = parsed.data.error_url ? String(parsed.data.error_url) : defaultErrorUrl

  const market = resolveBillingMarket(successUrl)
  const marketConfig = getCardcomMarketConfig(market, planId, planIlsAmount)

  const mergedUtm = { ...safeUtmFromRequest(req), ...(parsed.data.utm || {}) }

  if (existingSession?.id) {
    const checkoutSessionId = String(existingSession.id)

    // Re-open LowProfile for the existing session id (idempotent UX).
    // We intentionally do not store the redirect_url since it may expire.
    let opened: Awaited<ReturnType<typeof openLowProfile>>
    try {
      opened = await openLowProfile({
        amount: marketConfig.amount,
        coinId: marketConfig.coinId,
        pageLanguage: marketConfig.pageLanguage,
        successUrl,
        errorUrl,
        indicatorUrl,
        returnValue: checkoutSessionId,
      })
    } catch {
      await admin.from("auditor_checkout_sessions").update({ status: "failed" }).eq("id", checkoutSessionId)
      return NextResponse.json({ ok: false, error: "Failed to open payment page" }, { status: 502 })
    }

    await admin
      .from("auditor_checkout_sessions")
      .update({
        status: opened.ok ? "redirected" : "failed",
        provider_low_profile_code: opened.lowProfileCode || null,
        raw_open_response_json: opened.parsed,
        return_value: checkoutSessionId,
        success_url: successUrl,
        error_url: errorUrl,
        indicator_url: indicatorUrl,
        amount: marketConfig.amount,
        coin_id: marketConfig.coinId,
        marketing_source: String((linkRow as any).source || "vow"),
        link_id: linkId,
        created_from_url: parsed.data.created_from_url || null,
        utm_json: Object.keys(mergedUtm).length ? mergedUtm : null,
      } as any)
      .eq("id", checkoutSessionId)

    if (!opened.ok) {
      return NextResponse.json({ ok: false, error: "Payment provider error", provider: "cardcom" }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      reused: true,
      redirect_url: opened.redirectUrl,
      checkout_session_id: checkoutSessionId,
      plan_id: planId,
      amount: marketConfig.amount,
      currency: marketConfig.currency,
    })
  }

  // Create checkout session (auditor-only)
  const { data: cs, error: csErr } = await admin
    .from("auditor_checkout_sessions")
    .insert({
      company_id: companyId,
      user_id: auth.user.id,
      lead_id: null,
      scan_id: null,
      plan_id: planId,
      amount: marketConfig.amount,
      coin_id: marketConfig.coinId,
      status: "created",
      provider: "cardcom",
      return_value: null,
      success_url: successUrl,
      error_url: errorUrl,
      indicator_url: indicatorUrl,
      marketing_source: String((linkRow as any).source || "vow"),
      link_id: linkId,
      created_from_url: parsed.data.created_from_url || null,
      utm_json: Object.keys(mergedUtm).length ? mergedUtm : null,
    } as any)
    .select("id")
    .single()

  if (csErr || !cs?.id) {
    return NextResponse.json({ ok: false, error: "Failed to create checkout session" }, { status: 500 })
  }

  const checkoutSessionId = String(cs.id)

  // Open LowProfile payment page
  let opened: Awaited<ReturnType<typeof openLowProfile>>
  try {
    opened = await openLowProfile({
      amount: marketConfig.amount,
      coinId: marketConfig.coinId,
      pageLanguage: marketConfig.pageLanguage,
      successUrl,
      errorUrl,
      indicatorUrl,
      returnValue: checkoutSessionId,
    })
  } catch {
    await admin.from("auditor_checkout_sessions").update({ status: "failed" }).eq("id", checkoutSessionId)
    return NextResponse.json({ ok: false, error: "Failed to open payment page" }, { status: 502 })
  }

  await admin
    .from("auditor_checkout_sessions")
    .update({
      status: opened.ok ? "redirected" : "failed",
      provider_low_profile_code: opened.lowProfileCode || null,
      raw_open_response_json: opened.parsed,
      return_value: checkoutSessionId,
    } as any)
    .eq("id", checkoutSessionId)

  if (!opened.ok) {
    return NextResponse.json({ ok: false, error: "Payment provider error", provider: "cardcom" }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    redirect_url: opened.redirectUrl,
    checkout_session_id: checkoutSessionId,
    plan_id: planId,
    amount: marketConfig.amount,
    currency: marketConfig.currency,
  })
}

