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

  ;(async () => {
    try {
      const insertPayload = {
        provider: providerKey,
        event_id: eventId,
        status: "received",
        payload: { query: Object.fromEntries(url.searchParams.entries()) },
      }

      await admin
        .from("auditor_billing_events")
        .upsert(insertPayload, { onConflict: "provider,event_id", ignoreDuplicates: true })
    } catch (e) {
      console.warn("[AUDITOR_INDICATOR] async insert failed", e)
    }
  })()

  return NextResponse.json({ ok: true })
}
