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

  return { terminalNumber, apiUsername, mode }
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

async function handleIndicator(req: Request) {
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
    const qs = new URLSearchParams({
      terminalnumber: cfg.terminalNumber,
      username: cfg.apiUsername,
      lowprofilecode: lowProfileCode,
      codepage: "65001",
    })

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

  await adminDb
    .from("checkout_sessions")
    .update({
      status: paid ? "paid" : "failed",
      provider_internal_deal_number: internalDealNumber,
      raw_indicator_json: indicator,
    })
    .eq("id", String(checkout.id))

  if (paid) {
    // Activate subscription for buyer company
    const interval: "month" | "year" = checkout.billing_interval === "year" ? "year" : "month"
    const endIso = addPeriod(now, interval).toISOString()

    await adminDb
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

    // Auto-issue VOW accounting document under dedicated VOW billing company
    const issuerCompanyId = process.env.VOW_BILLING_COMPANY_ID
    if (!issuerCompanyId) {
      console.error("[CARDCOM_INDICATOR] Missing VOW_BILLING_COMPANY_ID")
    } else {
      const { data: issued, error: issueErr } = await adminDb.rpc("issue_paid_checkout_document_service", {
        p_checkout_session_id: String(checkout.id),
        p_issuer_company_id: String(issuerCompanyId),
      } as any)

      if (issueErr) {
        console.error("[CARDCOM_INDICATOR] issue_paid_checkout_document_service failed", { error: issueErr })
      } else if (Array.isArray(issued) && issued[0] && issued[0].ok !== true) {
        console.error("[CARDCOM_INDICATOR] issuance returned not-ok", issued[0])
      }
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

