export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

function verifyHmacSha256(params: { secret: string; rawBody: string; signatureHeader: string | null }) {
  const { secret, rawBody, signatureHeader } = params
  const sig = String(signatureHeader || "").trim()
  if (!sig) return false

  // Accept either:
  // - raw hex: <hex>
  // - prefixed: sha256=<hex>
  const hex = sig.startsWith("sha256=") ? sig.slice("sha256=".length) : sig
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false

  const expected = createHash("sha256").update(`${secret}:${rawBody}`, "utf8").digest("hex")
  try {
    const a = Uint8Array.from(Buffer.from(hex, "hex"))
    const b = Uint8Array.from(Buffer.from(expected, "hex"))
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `vow-billing-webhook:${ip}`, limit: 120, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const rawBody = await req.text().catch(() => "")
  const secret = String(process.env.VOW_BILLING_WEBHOOK_SECRET || "").trim()
  if (!secret) {
    console.error("[VOW_BILLING_WEBHOOK] Missing VOW_BILLING_WEBHOOK_SECRET")
    return NextResponse.json({ ok: false, message: "Misconfigured" }, { status: 500 })
  }

  const signature =
    req.headers.get("x-vow-signature") ||
    req.headers.get("x-webhook-signature") ||
    req.headers.get("x-signature") ||
    req.headers.get("stripe-signature") ||
    null

  const verified = verifyHmacSha256({ secret, rawBody, signatureHeader: signature })
  if (!verified) {
    return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 401 })
  }

  let payload: any = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }

  const headers = req.headers
  const headerEventId =
    headers.get("x-webhook-event-id") ||
    headers.get("x-provider-event-id") ||
    headers.get("x-event-id") ||
    null

  const eventId = headerEventId || `sha256:${sha256Hex(rawBody)}`
  const providerKey = "vow"

  const admin = createAdminClient()

  // Idempotency: insert first; if already exists → ignore
  const { error: insertErr } = await admin.from("billing_webhook_events").insert({
    provider: providerKey,
    event_id: eventId,
    status: "received",
    payload,
  })

  if (insertErr) {
    const code = (insertErr as any)?.code || ""
    if (code === "23505") {
      return NextResponse.json({ ok: true, status: "ignored", provider: providerKey, event_id: eventId })
    }
    console.error("[VOW_BILLING_WEBHOOK] insert failed", { event_id: eventId, error: insertErr })
    return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
  }

  // Phase-now: accept + store; future: update vow_billing_issued_documents status by event type
  await admin
    .from("billing_webhook_events")
    .update({ status: "ok", processed_at: new Date().toISOString() })
    .eq("provider", providerKey)
    .eq("event_id", eventId)

  return NextResponse.json({ ok: true, status: "ok", provider: providerKey, event_id: eventId })
}

