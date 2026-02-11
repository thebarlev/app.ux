export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

function getCardcomConfig() {
  const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER
  const apiUsername = process.env.CARDCOM_API_USERNAME
  const apiPassword = process.env.CARDCOM_API_PASSWORD
  const mode = (process.env.CARDCOM_MODE || "prod").toLowerCase() === "test" ? "test" : "prod"

  const missing: string[] = []
  if (!terminalNumber) missing.push("CARDCOM_TERMINAL_NUMBER")
  if (!apiUsername) missing.push("CARDCOM_API_USERNAME")
  if (!apiPassword) missing.push("CARDCOM_API_PASSWORD")
  if (missing.length) throw new Error(`Missing Cardcom env vars: ${missing.join(", ")}`)

  // NOTE: apiPassword is validated above even if not currently used here.
  // Keeping it ensures config completeness and avoids silent misconfig.
  return { terminalNumber, apiUsername, apiPassword, mode }
}

function parseNameValueResponse(rawText: string): Record<string, any> {
  const text = String(rawText || "").trim()
  if (!text) return {}

  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      return JSON.parse(text)
    } catch {
      // ignore and fall through
    }
  }

  const params = new URLSearchParams(text.replace(/^\?/, ""))
  const obj: Record<string, any> = {}
  for (const [k, v] of params.entries()) obj[k] = v
  return obj
}

function getFirstSearchParam(url: URL, keys: string[]): string | null {
  for (const k of keys) {
    const v = url.searchParams.get(k)
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function addPeriod(now: Date, interval: "month" | "year"): Date {
  const d = new Date(now.getTime())
  if (interval === "year") {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

function firstNonEmptyString(...vals: Array<any>): string | null {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : ""
    if (s) return s
  }
  return null
}

function extractTokenFromIndicator(indicator: Record<string, any>): {
  token: string
  tokenExDate: string | null
  brand: string | null
  cardNumStart: string | null
  cardNumEnd: string | null
} | null {
  const token = firstNonEmptyString(
    indicator.Token,
    indicator["ExtShvaParams.CardToken"],
    indicator["ExtShvaParams.CardToken_15"],
    indicator["TokenToCharge.Token"]
  )
  if (!token) return null

  const tokenExDate = firstNonEmptyString(indicator.TokenExDate, indicator.Tokef_30, indicator["ExtShvaParams.Tokef30"])

  const brand = firstNonEmptyString(
    indicator.Mutag_24,
    indicator["ExtShvaParams.Mutag24"],
    indicator["Mutag24"],
    indicator["Mutag"]
  )

  const cardNumStart = firstNonEmptyString(indicator.CardNumStart, indicator["ExtShvaParams.FirstCardDigits"])
  const cardNumEnd = firstNonEmptyString(indicator.CardNumEnd, indicator["ExtShvaParams.CardNumber5"])

  return { token, tokenExDate, brand, cardNumStart, cardNumEnd }
}

async function handleIndicator(req: Request) {
  // #region agent log (safe)
  try {
    fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "indicator/route.ts:handleIndicator:entry",
        message: "Indicator called",
        data: { hasUrl: !!req.url },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {})
  } catch {
    // ignore
  }
  // #endregion

  const ip = getClientIp(req)
  const rl = rateLimit({ key: `cardcom-indicator:${ip}`, limit: 120, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const url = new URL(req.url)
  const lowProfileCode =
    getFirstSearchParam(url, ["lowprofilecode", "LowProfileCode"]) ||
    getFirstSearchParam(url, ["lowProfileCode"]) ||
    null

  const returnValue = getFirstSearchParam(url, ["ReturnValue", "returnvalue", "returnValue"])

  if (!lowProfileCode) {
    // Cardcom expects HTTP-200; keep response minimal.
    return NextResponse.json({ ok: true, status: "ignored", message: "Missing lowprofilecode" })
  }

  const providerKey = "cardcom"
  const eventId = `lowprofile:${lowProfileCode}`

  const admin = createAdminClient()

  // Idempotency record (do NOT hard-ignore duplicates; retries may be needed after transient errors)
  const { error: insertErr } = await admin.from("billing_webhook_events").insert({
    provider: providerKey,
    event_id: eventId,
    status: "received",
    payload: { query: Object.fromEntries(url.searchParams.entries()) },
  })

  if (insertErr) {
    const code = (insertErr as any)?.code || ""
    if (code !== "23505") {
      console.error("[CARDCOM_INDICATOR] billing_webhook_events insert failed", { eventId, error: insertErr })
    }
  }

  // Always verify server-to-server by pulling indicator (never trust redirect)
  let indicatorRaw = ""
  let indicator: Record<string, any> = {}
  try {
    const cfg = getCardcomConfig()
    const indicatorUrl = "https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx"
    
    const terminalNumber = cfg.terminalNumber ?? ""
    const apiUsername = cfg.apiUsername ?? ""
    
    const qs = new URLSearchParams()
    qs.set("terminalnumber", terminalNumber)
    qs.set("username", apiUsername)
    qs.set("lowprofilecode", lowProfileCode)
    qs.set("codepage", "65001")
    
    

    const r = await fetch(`${indicatorUrl}?${qs.toString()}`, { method: "GET" })
    indicatorRaw = await r.text()
    indicator = parseNameValueResponse(indicatorRaw)
  } catch (e: any) {
    await admin
      .from("billing_webhook_events")
      .update({ status: "error", processed_at: new Date().toISOString(), payload: { error: "pull_failed" } })
      .eq("provider", providerKey)
      .eq("event_id", eventId)

    return NextResponse.json({ ok: true, status: "error" })
  }

  const operationResponse = Number((indicator as any).OperationResponse ?? NaN)
  const internalDealNumber = String((indicator as any).InternalDealNumber ?? "").trim() || null
  const tokenInfo = extractTokenFromIndicator(indicator)

  // #region agent log (safe)
  try {
    fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "indicator/route.ts:afterCardcomPull",
        message: "Cardcom indicator parsed",
        data: {
          lowProfileCode,
          returnValue,
          operationResponse,
          paid: Number.isFinite(operationResponse) && operationResponse === 0,
        },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {})
  } catch {
    // ignore
  }
  // #endregion

  // Lookup checkout session (prefer LowProfileCode, fallback to ReturnValue if provided)
  const adminDb = createServiceRoleClient()

  let checkout: any = null
  {
    const r1 = await adminDb
      .from("checkout_sessions")
      .select("id, company_id, plan_id, billing_interval, amount, coin_id, status, provider_low_profile_code")
      .eq("provider_low_profile_code", lowProfileCode)
      .maybeSingle()
    if (!r1.error && r1.data) checkout = r1.data
  }

  if (!checkout && returnValue) {
    // ReturnValue is expected to be the checkout_session_id
    const maybeUuid = String(returnValue)
    const r2 = await adminDb
      .from("checkout_sessions")
      .select("id, company_id, plan_id, billing_interval, amount, coin_id, status, provider_low_profile_code")
      .eq("id", maybeUuid)
      .maybeSingle()
    if (!r2.error && r2.data) checkout = r2.data
  }

  if (!checkout?.id) {
    // #region agent log (safe)
    try {
      fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "indicator/route.ts:checkoutNotFound",
          message: "Checkout not found",
          data: { lowProfileCode, returnValue },
          timestamp: Date.now(),
          hypothesisId: "H2",
        }),
      }).catch(() => {})
    } catch {
      // ignore
    }
    // #endregion

    await admin
      .from("billing_webhook_events")
      .update({
        status: "error",
        processed_at: new Date().toISOString(),
        payload: { indicator, error: "checkout_session_not_found" },
      })
      .eq("provider", providerKey)
      .eq("event_id", eventId)

    return NextResponse.json({ ok: true, status: "ok" })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  const paid = Number.isFinite(operationResponse) && operationResponse === 0

  async function logBillingFailure(stage: string, err: any) {
    try {
      await adminDb.from("billing_failures").insert({
        checkout_session_id: checkout.id,
        company_id: checkout.company_id,
        failure_stage: stage,
        error_message: err?.message ?? String(err),
        error_details: { error: err },
      })
    } catch {
      console.error("[CARDCOM_INDICATOR] Failed to log billing_failure", { stage, err })
    }
  }

  await adminDb
    .from("checkout_sessions")
    .update({
      status: paid ? "paid" : "failed",
      provider_internal_deal_number: internalDealNumber,
      raw_indicator_json: indicator,
    })
    .eq("id", String(checkout.id))

  if (paid) {
    const interval: "month" | "year" = checkout.billing_interval === "year" ? "year" : "month"
    const endIso = addPeriod(now, interval).toISOString()

    // 1) Activate subscription for buyer company (must succeed)
    const { error: subErr } = await adminDb
      .from("subscriptions")
      .update({
        plan_id: checkout.plan_id,
        status: "active",
        provider: "cardcom",
        billing_interval: interval,
        current_period_start: nowIso,
        current_period_end: endIso,
      })
      .eq("company_id", String(checkout.company_id))

    // #region agent log (safe)
    try {
      fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "indicator/route.ts:subscriptionUpdate",
          message: "Subscription update result",
          data: {
            checkoutId: checkout.id,
            companyId: checkout.company_id,
            planId: checkout.plan_id,
            subErr: subErr ? String(subErr) : null,
          },
          timestamp: Date.now(),
          hypothesisId: "H4",
        }),
      }).catch(() => {})
    } catch {
      // ignore
    }
    // #endregion

    if (subErr) {
      console.error("[CARDCOM_INDICATOR] Subscription update failed", { checkoutId: checkout.id, error: subErr })
      await logBillingFailure("subscription_update", subErr)
    }

    // 2) Persist latest active token
    if (tokenInfo?.token) {
      try {
        await adminDb
          .from("customer_payment_methods")
          .update({ status: "revoked" })
          .eq("company_id", String(checkout.company_id))
          .eq("provider", "cardcom")
          .eq("status", "active")
          .neq("token", tokenInfo.token)

        await adminDb.from("customer_payment_methods").upsert(
          {
            company_id: String(checkout.company_id),
            user_id: null,
            provider: "cardcom",
            token: tokenInfo.token,
            token_ex_date: tokenInfo.tokenExDate,
            brand: tokenInfo.brand,
            card_num_start: tokenInfo.cardNumStart,
            card_num_end: tokenInfo.cardNumEnd,
            status: "active",
          } as any,
          { onConflict: "company_id,provider,token" }
        )
      } catch (e: any) {
        console.error("[CARDCOM_INDICATOR] Failed to persist token", { error: e?.message || e })
        await logBillingFailure("token_persist", e)
      }
    }

    // 3) Auto-issue VOW accounting document (ALWAYS call; RPC is idempotent)
    const issuerCompanyId = process.env.VOW_BILLING_COMPANY_ID
    let issued: any = null,
      issueErr: any = null

    if (issuerCompanyId) {
      const r = await adminDb.rpc("issue_paid_checkout_document_service", {
        p_checkout_session_id: String(checkout.id),
        p_issuer_company_id: String(issuerCompanyId),
      } as any)
      issued = r.data
      issueErr = r.error
    }

    // #region agent log (safe)
    try {
      fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "indicator/route.ts:documentIssuance",
          message: "Document issuance result",
          data: {
            checkoutId: checkout.id,
            issuerCompanyId: !!issuerCompanyId,
            issueErr: issueErr ? String(issueErr) : null,
            issuedOk: Array.isArray(issued) && issued[0] ? issued[0].ok : null,
          },
          timestamp: Date.now(),
          hypothesisId: "H3",
        }),
      }).catch(() => {})
    } catch {
      // ignore
    }
    // #endregion

    if (!issuerCompanyId) {
      console.error("[CARDCOM_INDICATOR] Missing VOW_BILLING_COMPANY_ID")
      await logBillingFailure("document_issuance", new Error("VOW_BILLING_COMPANY_ID not set"))
    } else if (issueErr) {
      console.error("[CARDCOM_INDICATOR] issue_paid_checkout_document_service failed", { error: issueErr })
      await logBillingFailure("document_issuance", issueErr)
    } else if (Array.isArray(issued) && issued[0] && issued[0].ok !== true) {
      console.error("[CARDCOM_INDICATOR] issuance returned not-ok", issued[0])
      await logBillingFailure("document_issuance", new Error(JSON.stringify(issued[0])))
    }
  }

  await admin
    .from("billing_webhook_events")
    .update({
      status: paid ? "ok" : "ignored",
      processed_at: new Date().toISOString(),
      payload: { indicator, checkout_session_id: String(checkout.id) },
    })
    .eq("provider", providerKey)
    .eq("event_id", eventId)

  return NextResponse.json({ ok: true, status: "ok" })
}

export async function GET(req: Request) {
  return handleIndicator(req)
}

export async function POST(req: Request) {
  return handleIndicator(req)
}
