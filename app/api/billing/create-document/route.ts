export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { createBillingDocument } from "@/lib/billing/vow-billing/billing-service"
import {
  DocIssueTracker,
  logDocIssueBootOnce,
  maskEmail,
  shortUserId,
} from "@/lib/diagnostics/external-services-check"

export async function POST(req: Request) {
  logDocIssueBootOnce()
  const tracker = new DocIssueTracker()

  const ip = getClientIp(req)
  const rl = rateLimit({ key: `vow-billing-create-document:${ip}`, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ success: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const body = (await req.json().catch(() => ({} as any))) as any

  // ── Auth: Supabase session  OR  x-api-key (server-to-server from mioshy) ──
  const incomingApiKey = req.headers.get("x-api-key") ?? ""
  const expectedApiKey = process.env.UXELLENT_BILLING_API_KEY ?? ""
  const apiKeyPresent  = incomingApiKey.length > 0
  const isApiKeyAuth   = !!(apiKeyPresent && expectedApiKey && incomingApiKey === expectedApiKey)

  let resolvedUserId: string
  let resolvedEmail:  string

  if (isApiKeyAuth) {
    // Trusted server call — caller must supply user_id + email in body
    const source = req.headers.get("x-source") ?? "external"
    console.info(`[create-document] API key auth from source="${source}"`)

    resolvedUserId = typeof body?.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : ""
    resolvedEmail  = typeof body?.email   === "string" && body.email.trim()   ? body.email.trim()   : ""

    if (!resolvedUserId || !resolvedEmail) {
      // Caller authenticated correctly but sent a bad payload — that IS
      // a misconfiguration worth surfacing at error severity.
      tracker.fail("auth_resolved", new Error("missing_user_id_or_email_for_api_key_auth"), { auth_mode: "api_key" })
      return NextResponse.json(
        { success: false, message: "user_id and email are required for API key auth", attempt_id: tracker.attemptId, step: "auth_resolved" },
        { status: 400 },
      )
    }
  } else {
    // Regular browser session
    const userClient = await createClient()
    const { data: auth } = await userClient.auth.getUser()
    if (!auth?.user) {
      // 401s on this endpoint are common (external probes, expired
      // sessions, mioshy with a rotated key) and are NOT pipeline
      // failures. Log at warn so they don't drown out real DOC_ISSUE
      // errors, and disambiguate what the caller actually attempted so
      // a key-rotation incident is obvious from one log line.
      const attemptedAuth =
        apiKeyPresent ? "api_key_mismatch" :
        req.headers.get("cookie") ? "session_invalid_or_expired" :
        "none"
      console.warn("[create-document] unauthorized", {
        attempt_id: tracker.attemptId,
        attempted_auth: attemptedAuth,
        expected_api_key_configured: expectedApiKey.length > 0,
        ip,
      })
      return NextResponse.json({ success: false, message: "Unauthorized", attempt_id: tracker.attemptId, step: "auth_resolved" }, { status: 401 })
    }
    // Identity comes from the session ONLY. body.user_id / body.email are
    // ignored here on purpose: this endpoint issues a final, signed
    // invoice-receipt in the books of VOW_BILLING_COMPANY_ID, so honouring a
    // client-supplied identity let any authenticated user issue a real tax
    // document in someone else's name.
    // The x-api-key branch above still takes them from the body — that is a
    // trusted server-to-server integration and is unchanged.
    resolvedUserId = auth.user.id
    resolvedEmail  = auth.user.email || ""
  }

  tracker.step("auth_resolved", {
    auth_mode: isApiKeyAuth ? "api_key" : "session",
    user_id8: shortUserId(resolvedUserId),
    email_masked: maskEmail(resolvedEmail),
    has_country: typeof body?.country === "string" && body.country.trim().length > 0,
    has_amount: typeof body?.amount === "number" || (typeof body?.amount === "string" && body.amount.length > 0),
    has_currency: typeof body?.currency === "string" && body.currency.trim().length > 0,
    is_israeli: body?.is_israeli === true,
    language: body?.language === "en" ? "en" : "he",
  })

  // Idempotency key — accepted from body OR header. Caller convention
  // (mioshy): `mioshy:<deal_number>`. Issuer pairs (provider, key) into
  // a unique index so duplicate calls return the same document.
  const headerIdempotencyKey =
    req.headers.get("x-idempotency-key") ??
    req.headers.get("idempotency-key") ?? // Stripe-style alias
    null
  const bodyIdempotencyKey =
    typeof body?.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim()
      : null
  const idempotencyKey =
    bodyIdempotencyKey ??
    (typeof headerIdempotencyKey === "string" && headerIdempotencyKey.trim()
      ? headerIdempotencyKey.trim()
      : undefined)

  const input = {
    user_id:    resolvedUserId,
    email:      resolvedEmail,
    country:    typeof body?.country    === "string" ? body.country.trim().toUpperCase() : "",
    amount:     typeof body?.amount     === "number" ? body.amount : Number(body?.amount),
    currency:   typeof body?.currency   === "string" ? body.currency.trim().toUpperCase() : "",
    language:   body?.language === "en" ? "en" : "he",
    is_israeli: body?.is_israeli === true,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  } as const

  try {
    const result = await createBillingDocument(input as any, { tracker })
    if (!result.success) {
      tracker.fail("done", new Error(result.message), { code: (result as any).code ?? null, step: "billing_service_returned_failure" })
      return NextResponse.json(
        { ...result, attempt_id: tracker.attemptId, step: "billing_service" },
        { status: result.code === "validation_error" ? 400 : 502 },
      )
    }

    tracker.step("done", {
      document_id: result.document_id,
      idempotent_replay: !!result.idempotent_replay,
    })

    return NextResponse.json({
      success: true,
      document_url: result.document_url,
      document_id: result.document_id,
      attempt_id: tracker.attemptId,
      ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
    })
  } catch (e: any) {
    tracker.fail("done", e, { step: "uncaught_in_route" })
    return NextResponse.json(
      {
        success: false,
        message: "internal_error",
        attempt_id: tracker.attemptId,
        step: "uncaught_in_route",
        code: e?.code ?? null,
      },
      { status: 500 },
    )
  }
}
