export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"

function getFirstSearchParam(url: URL, keys: string[]): string | null {
  for (const k of keys) {
    const v = url.searchParams.get(k)
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/**
 * Cardcom indicator callback - MUST return within seconds.
 * Heavy work (pull indicator, checkout, subscription, invoice) is done by
 * /api/auditor/billing/process-pending (cron).
 */
export async function GET(req: Request) {
  const t0 = Date.now()
  const url = new URL(req.url)

  const terminalnumber = url.searchParams.get("terminalnumber")
  const lowProfileCode =
    getFirstSearchParam(url, ["lowprofilecode", "LowProfileCode"]) || getFirstSearchParam(url, ["lowProfileCode"]) || null

  console.log("[AUDITOR_INDICATOR] start", { terminalnumber, lowProfileCode, ms: Date.now() - t0 })

  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  // Cardcom expects HTTP 200; keep response minimal.
  if (!lowProfileCode) {
    console.log("[AUDITOR_INDICATOR] missing lowprofilecode", { ms: Date.now() - t0 })
    return NextResponse.json({ ok: true, status: "ignored", message: "Missing lowprofilecode" })
  }

  const admin = createAdminClient()
  const providerKey = "cardcom"
  const eventId = `cardcom:indicator:${lowProfileCode}`

  // 1) Quick idempotent insert - store raw query for async processing
  // Timeout 30s (cold start / Supabase latency); Cardcom expects 200
  const INSERT_TIMEOUT_MS = 30_000
  console.log("[AUDITOR_INDICATOR] before insert", Date.now() - t0)
  try {
    const insertPayload = {
      provider: providerKey,
      event_id: eventId,
      status: "received",
      payload: { query: Object.fromEntries(url.searchParams.entries()) },
    } as any
    const result = await Promise.race([
      admin.from("auditor_billing_events").insert(insertPayload),
      new Promise<{ error: { code?: string; message?: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { code: "timeout", message: "insert_timeout" } }), INSERT_TIMEOUT_MS)
      ),
    ]) as any
    const evErr = result?.error
    if (evErr) {
      if (String(evErr?.code || "") === "23505") {
        // Unique violation = already received, idempotent ok
      } else {
        console.warn("[AUDITOR_INDICATOR] insert warning", { error: evErr?.message, code: evErr?.code, ms: Date.now() - t0 })
      }
    } else {
      console.log("[AUDITOR_INDICATOR] insert ok", { ms: Date.now() - t0 })
    }
  } catch (e) {
    console.warn("[AUDITOR_INDICATOR] insert exception", { error: e, ms: Date.now() - t0 })
    // still return 200 - Cardcom must not retry indefinitely
  }
  console.log("[AUDITOR_INDICATOR] after insert", Date.now() - t0)

  // 2) Immediate response - Cardcom expects HTTP 200
  return NextResponse.json({ ok: true })
}
