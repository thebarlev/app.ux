export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const providerKey = String(provider || "").toLowerCase().trim()

  const ip = getClientIp(req)
  const rl = rateLimit({ key: `billing-webhook:${providerKey}:${ip}`, limit: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const rawBody = await req.text().catch(() => "")
  const headers = req.headers

  const headerEventId =
    headers.get("x-webhook-event-id") ||
    headers.get("x-provider-event-id") ||
    headers.get("x-event-id") ||
    null

  const eventId = headerEventId || `sha256:${sha256Hex(rawBody)}`

  let payload: any = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }

  const admin = createAdminClient()

  // Idempotency: insert first; if already exists → ignore
  const { error: insertErr } = await admin.from("billing_webhook_events").insert({
    provider: providerKey,
    event_id: eventId,
    status: "received",
    payload,
  })

  if (insertErr) {
    // Duplicate (already processed/received)
    const code = (insertErr as any)?.code || ""
    if (code === "23505") {
      return NextResponse.json({ ok: true, status: "ignored", provider: providerKey, event_id: eventId })
    }
    console.error("[BILLING_WEBHOOK] insert failed", { provider: providerKey, event_id: eventId, error: insertErr })
    return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
  }

  // Phase-now: provider not configured; keep endpoint live and idempotent.
  const configured = false

  if (!configured) {
    await admin
      .from("billing_webhook_events")
      .update({ status: "ignored", processed_at: new Date().toISOString() })
      .eq("provider", providerKey)
      .eq("event_id", eventId)

    return NextResponse.json({
      ok: true,
      status: "ignored",
      message: "Billing provider not configured (MVP placeholder).",
      provider: providerKey,
      event_id: eventId,
    })
  }

  // Phase-later: verify signature + map event → subscriptions update
  // (intentionally not implemented in MVP)
}

