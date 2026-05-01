export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { createBillingDocument } from "@/lib/billing/vow-billing/billing-service"

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `vow-billing-create-document:${ip}`, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ success: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const body = (await req.json().catch(() => ({} as any))) as any

  // ── Auth: Supabase session  OR  x-api-key (server-to-server from mioshy) ──
  const incomingApiKey = req.headers.get("x-api-key") ?? ""
  const expectedApiKey = process.env.UXELLENT_BILLING_API_KEY ?? ""
  const isApiKeyAuth   = !!(incomingApiKey && expectedApiKey && incomingApiKey === expectedApiKey)

  let resolvedUserId: string
  let resolvedEmail:  string

  if (isApiKeyAuth) {
    // Trusted server call — caller must supply user_id + email in body
    const source = req.headers.get("x-source") ?? "external"
    console.info(`[create-document] API key auth from source="${source}"`)

    resolvedUserId = typeof body?.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : ""
    resolvedEmail  = typeof body?.email   === "string" && body.email.trim()   ? body.email.trim()   : ""

    if (!resolvedUserId || !resolvedEmail) {
      return NextResponse.json(
        { success: false, message: "user_id and email are required for API key auth" },
        { status: 400 },
      )
    }
  } else {
    // Regular browser session
    const userClient = await createClient()
    const { data: auth } = await userClient.auth.getUser()
    if (!auth?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }
    resolvedUserId = typeof body?.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : auth.user.id
    resolvedEmail  = typeof body?.email   === "string" && body.email.trim()   ? body.email.trim()   : (auth.user.email || "")
  }

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

  const result = await createBillingDocument(input as any)
  if (!result.success) {
    return NextResponse.json(result, { status: result.code === "validation_error" ? 400 : 502 })
  }

  return NextResponse.json({
    success: true,
    document_url: result.document_url,
    document_id: result.document_id,
    ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
  })
}
