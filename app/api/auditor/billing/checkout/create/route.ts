export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getPublicBaseUrl, openLowProfile, requirePublicCallbackUrl } from "@/lib/auditor/billing/cardcom"
import { getCardcomMarketConfig, resolveBillingMarket } from "@/lib/auditor/billing/market"

const bodySchema = z.object({
  plan_id: z.enum(["basic", "pro", "premium"]),
  scanId: z.string().uuid(),
  token: z.string().min(10),
  base_path: z.string().optional(),
})

export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  // Validate scan token (customer access model)
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id, lead_id, scan_access_token")
    .eq("id", parsed.data.scanId)
    .maybeSingle()

  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  if (String(scan.scan_access_token || "") !== parsed.data.token) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }
  if (!scan.lead_id) {
    return NextResponse.json({ ok: false, error: "Missing lead for scan" }, { status: 400 })
  }

  // Resolve amount from auditor plans (server-truth)
  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id,name,monthly_amount,currency,is_active")
    .eq("id", parsed.data.plan_id)
    .eq("is_active", true)
    .maybeSingle()

  if (!plan) return NextResponse.json({ ok: false, error: "Plan not available" }, { status: 400 })

  const planIlsAmount = Number((plan as any).monthly_amount ?? NaN)
  if (!Number.isFinite(planIlsAmount) || planIlsAmount <= 0) {
    return NextResponse.json({ ok: false, error: "Plan price not configured" }, { status: 400 })
  }

  const base = (parsed.data.base_path || "/auditor").replace(/\/+$/, "") || "/auditor"
  const market = resolveBillingMarket(undefined, base)
  const marketConfig = getCardcomMarketConfig(market, parsed.data.plan_id, planIlsAmount)

  const publicBaseUrl = getPublicBaseUrl(req)
  try {
    requirePublicCallbackUrl(req, publicBaseUrl)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }

  const successUrl = `${publicBaseUrl}${base}/success`
  const errorUrl = `${publicBaseUrl}${base}?checkout=error&scanId=${encodeURIComponent(parsed.data.scanId)}&token=${encodeURIComponent(parsed.data.token)}`
  const indicatorUrl = `${publicBaseUrl}/api/auditor/billing/cardcom/indicator`

  // Create checkout session (auditor-only)
  const { data: cs, error: csErr } = await admin
    .from("auditor_checkout_sessions")
    .insert({
      company_id: null,
      user_id: null,
      lead_id: scan.lead_id,
      scan_id: scan.id,
      plan_id: plan.id,
      amount: marketConfig.amount,
      coin_id: marketConfig.coinId,
      status: "created",
      provider: "cardcom",
      return_value: null,
      success_url: successUrl,
      error_url: errorUrl,
      indicator_url: indicatorUrl,
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
    })
    .eq("id", checkoutSessionId)

  if (!opened.ok) {
    return NextResponse.json({ ok: false, error: "Payment provider error", provider: "cardcom" }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    redirect_url: opened.redirectUrl,
    checkout_session_id: checkoutSessionId,
  })
}

