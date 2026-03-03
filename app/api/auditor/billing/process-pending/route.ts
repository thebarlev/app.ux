export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"

const BATCH_LIMIT = 3
const MAX_MS = 240_000 // 240 seconds - stop before 300s Vercel limit

function isAuthorized(req: Request): boolean {
  // Vercel Cron sends this header (no secret)
  const isVercelCron = req.headers.get("x-vercel-cron") === "1"
  if (isVercelCron) return true

  // Optional: external cron with secret
  const billingSecret = getAuditorBillingConfig().cronSecret
  const got = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (billingSecret && got === billingSecret) return true

  return false
}

async function handler(req: Request) {
  const auditorCfg = getAuditorConfig()
  if (!auditorCfg.enabled) return new NextResponse(null, { status: 404 })
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 401 })

  const admin = createAdminClient()
  const t0 = Date.now()

  // 1) Atomic claim via RPC (run script 085 first). Fallback: select + update if RPC missing.
  let events: { provider: string; event_id: string; payload: any }[] = []
  const { data: toProcess, error: lockErr } = await admin.rpc("auditor_billing_events_claim_pending", {
    p_provider: "cardcom",
    p_limit: BATCH_LIMIT,
  } as any)

  if (!lockErr && Array.isArray(toProcess) && toProcess.length > 0) {
    events = toProcess
  } else {
    // Fallback before migration 085: select + update. Run script 085 for atomic lock.
    const { data: rows } = await admin
      .from("auditor_billing_events")
      .select("provider, event_id, payload")
      .eq("provider", "cardcom")
      .eq("status", "received")
      .is("processed_at", null)
      .order("received_at", { ascending: true })
      .limit(BATCH_LIMIT)

    if (rows?.length) {
      const eventIds = rows.map((r: any) => r.event_id)
      const { error: updErr } = await admin
        .from("auditor_billing_events")
        .update({ status: "processing", processing_started_at: new Date().toISOString() } as any)
        .eq("provider", "cardcom")
        .in("event_id", eventIds)

      if (!updErr) events = rows
    }
  }

  const results: { event_id: string; ok: boolean; error?: string }[] = []

  for (const ev of events) {
    if (Date.now() - t0 > MAX_MS) {
      console.warn("[AUDITOR_PROCESS] Stopping: time limit reached", { processed: results.length })
      break
    }

    const eventId = String((ev as any).event_id || "")
    const payload = (ev as any).payload || {}

    try {
      const result = await processCardcomIndicatorEvent(admin, eventId, payload)
      results.push({ event_id: eventId, ok: result.ok, error: result.error })
    } catch (e: any) {
      console.error("[AUDITOR_PROCESS] Event failed", { eventId, error: e?.message })
      results.push({ event_id: eventId, ok: false, error: String(e?.message || e) })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results, ms: Date.now() - t0 })
}

export async function GET(req: Request) {
  console.log("[CRON DEBUG]", {
    x_vercel_cron: req.headers.get("x-vercel-cron"),
    headers: Object.fromEntries(req.headers.entries()),
  })
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}
