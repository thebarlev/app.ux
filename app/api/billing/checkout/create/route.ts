export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

type BillingInterval = "month" | "year"

function toBillingInterval(input: any): BillingInterval {
  return input === "year" ? "year" : "month"
}

function getPublicBaseUrl(req: Request): string {
  const fromEnv = process.env.PUBLIC_BASE_URL
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim().replace(/\/+$/, "")
  return new URL(req.url).origin
}

function getCardcomConfig() {
  const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER
  const apiUsername = process.env.CARDCOM_API_USERNAME
  const apiPassword = process.env.CARDCOM_API_PASSWORD
  const mode = (process.env.CARDCOM_MODE || "prod").toLowerCase() === "test" ? "test" : "prod"

  const missing: string[] = []
  if (!terminalNumber) missing.push("CARDCOM_TERMINAL_NUMBER")
  if (!apiUsername) missing.push("CARDCOM_API_USERNAME")
  if (!apiPassword) missing.push("CARDCOM_API_PASSWORD")

  if (missing.length) {
    throw new Error(`Missing Cardcom env vars: ${missing.join(", ")}`)
  }

  return { terminalNumber, apiUsername, apiPasswordPresent: true, mode }
}

function parseNameValueResponse(rawText: string): Record<string, any> {
  const text = String(rawText || "").trim()
  if (!text) return {}

  // Some Cardcom responses may be JSON.
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      return JSON.parse(text)
    } catch {
      // fall through to name=value parsing
    }
  }

  // Name-to-value format typically resembles a query string: a=b&c=d
  const params = new URLSearchParams(text.replace(/^\?/, ""))
  const obj: Record<string, any> = {}
  for (const [k, v] of params.entries()) obj[k] = v
  return obj
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `billing-checkout-create:${ip}`, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  // Validate auth (buyer)
  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const planId = String(body?.plan_id || "").trim()
  const billingInterval = toBillingInterval(body?.billing_interval)

  if (!planId) {
    return NextResponse.json({ ok: false, message: "Missing plan_id" }, { status: 400 })
  }

  // Ensure Cardcom is configured (env-only, VOW-only)
  getCardcomConfig()

  const companyId = await getCompanyIdForUser()
  const publicBaseUrl = getPublicBaseUrl(req)

  const defaultSuccessUrl = `${publicBaseUrl}/dashboard?checkout=success`
  const defaultErrorUrl = `${publicBaseUrl}/dashboard?checkout=error`

  const successUrl = typeof body?.success_url === "string" && body.success_url.trim() ? String(body.success_url).trim() : defaultSuccessUrl
  const errorUrl = typeof body?.error_url === "string" && body.error_url.trim() ? String(body.error_url).trim() : defaultErrorUrl
  const indicatorUrl = `${publicBaseUrl}/api/billing/cardcom/indicator`

  // Resolve amount from plans
  const { data: plan, error: planErr } = await userClient
    .from("plans")
    .select("id, price_monthly, price_yearly")
    .eq("id", planId)
    .maybeSingle()

  if (planErr || !plan) {
    return NextResponse.json({ ok: false, message: "Plan not available" }, { status: 400 })
  }

  const rawPrice = billingInterval === "year" ? (plan as any).price_yearly : (plan as any).price_monthly
  const amount = typeof rawPrice === "number" ? rawPrice : rawPrice ? Number(rawPrice) : NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, message: "Plan price is not configured" }, { status: 400 })
  }

  // MVP: fixed ILS (CoinId=1). Extend later if needed.
  const coinId = 1

  const admin = createServiceRoleClient()

  // Create checkout session
  const { data: cs, error: csErr } = await admin
    .from("checkout_sessions")
    .insert({
      company_id: companyId,
      user_id: auth.user.id,
      plan_id: planId,
      billing_interval: billingInterval,
      amount,
      coin_id: coinId,
      status: "created",
      provider: "cardcom",
      return_value: null,
      success_url: successUrl,
      error_url: errorUrl,
      indicator_url: indicatorUrl,
    })
    .select("id")
    .single()

  if (csErr || !cs?.id) {
    console.error("[BILLING_CHECKOUT_CREATE] failed to insert checkout_session", { error: csErr })
    return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
  }

  const checkoutSessionId = String(cs.id)

  // Cardcom LowProfile open page
  const cfg = getCardcomConfig()
  const cardcomUrl = "https://secure.cardcom.solutions/Interface/LowProfile.aspx"

  const sumToBill = amount.toFixed(2)
  const form = new URLSearchParams({
    Operation: "2", // charge + create token (Cardcom docs)
    TerminalNumber: cfg.terminalNumber,
    UserName: cfg.apiUsername,
    SumToBill: sumToBill,
    CoinId: String(coinId),
    APILevel: "10",
    Codepage: "65001",
    SuccessRedirectUrl: successUrl,
    ErrorRedirectUrl: errorUrl,
    IndicatorUrl: indicatorUrl,
    ReturnValue: checkoutSessionId, // <= 250 chars; used for correlation
  })

  let rawOpenText = ""
  try {
    const r = await fetch(cardcomUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: form,
    })
    rawOpenText = await r.text()
  } catch (e: any) {
    await admin.from("checkout_sessions").update({ status: "failed" }).eq("id", checkoutSessionId)
    return NextResponse.json({ ok: false, message: "Failed to open payment page" }, { status: 502 })
  }

  const open = parseNameValueResponse(rawOpenText)
  const responseCode = String((open as any).ResponseCode ?? "")
  const lowProfileCode = String((open as any).LowProfileCode ?? "").trim()
  const redirectUrl = String((open as any).url ?? "").trim()

  await admin
    .from("checkout_sessions")
    .update({
      status: lowProfileCode && redirectUrl && responseCode === "0" ? "redirected" : "failed",
      provider_low_profile_code: lowProfileCode || null,
      raw_open_response_json: open,
      return_value: checkoutSessionId,
    })
    .eq("id", checkoutSessionId)

  if (responseCode !== "0" || !lowProfileCode || !redirectUrl) {
    return NextResponse.json(
      { ok: false, message: "Payment provider error", provider: "cardcom" },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    checkout_session_id: checkoutSessionId,
    redirect_url: redirectUrl,
  })
}

