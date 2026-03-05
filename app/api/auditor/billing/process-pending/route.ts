export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"

const BATCH_LIMIT = 3
const MAX_MS = 240_000 // stop before 300s Vercel limit

// Read once (avoid throwing inside auth checks)
let CRON_SECRET: string | null = null
try {
  CRON_SECRET = getAuditorBillingConfig().cronSecret || null
} catch {
  CRON_SECRET = null
}

function isAuthorized(req: Request): boolean {
  // Vercel Cron identification
  const ua = req.headers.get("user-agent") || ""
  const isVercelCron = ua.startsWith("vercel-cron/") || !!req.headers.get("x-vercel-cron-schedule")
  if (isVercelCron) return true

  // Optional: external cron with secret
  const got =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")

  if (CRON_SECRET && got && got === CRON_SECRET) return true
  return false
}

async function handler(req: Request) {
  const auditorCfg = getAuditorConfig()
  if (!auditorCfg.enabled) return new NextResponse(null, { status: 404 })
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 401 })

  const admin = createAdminClient()
  const t0 = Date.now()

  // 1) Atomic claim via RPC (script 085)
  const { data: toProcess, error: lockErr } = await admin.rpc("auditor_billing_events_claim_pending", {
    p_provider: "cardcom",
    p_limit: BATCH_LIMIT,
  } as any)

  const events: { provider: string; event_id: string; payload: any }[] =
    !lockErr && Array.isArray(toProcess) ? toProcess : []

  // If RPC missing, fail fast (avoid non-atomic double-processing in prod)
  if (events.length === 0 && lockErr) {
    console.error("[AUDITOR_PROCESS] claim RPC failed", { error: (lockErr as any)?.message || String(lockErr) })
    return NextResponse.json({ ok: false, error: "claim_failed" }, { status: 500 })
  }

  const results: { event_id: string; ok: boolean; error?: string }[] = []

  for (const ev of events) {
    if (Date.now() - t0 > MAX_MS) {
      console.warn("[AUDITOR_PROCESS] stop: time limit reached", { processed: results.length })
      break
    }

    const eventId = String((ev as any).event_id || "")
    const payload = (ev as any).payload || {}
    const provider = String((ev as any).provider || "cardcom")

    let finalStatus: "ok" | "error" | "ignored" = "ok"
    let finalPayload: any = payload
    let finalError: string | null = null

    try {
      const r = await processCardcomIndicatorEvent(admin, eventId, payload)

      if (r.ignored) finalStatus = "ignored"
      else if (r.error) finalStatus = "error"
      else finalStatus = "ok"

      finalError = r.error || null
      finalPayload = { ...(payload || {}), ...(r.ignored ? { ignored: r.ignored } : {}), ...(r.paid !== undefined ? { paid: r.paid } : {}), ...(r.error ? { error: r.error } : {}) }

      results.push({ event_id: eventId, ok: !!r.ok, error: r.error })
    } catch (e: any) {
      finalStatus = "error"
      finalError = String(e?.message || e)
      finalPayload = { ...(payload || {}), error: finalError }

      console.error("[AUDITOR_PROCESS] event failed", { eventId, error: finalError })
      results.push({ event_id: eventId, ok: false, error: finalError })
    } finally {
      const { error: markErr } = await admin
        .from("auditor_billing_events")
        .update({
          status: finalStatus,
          processed_at: new Date().toISOString(),
          payload: { ...(ev as any).payload, ...(finalPayload || {}) },
        } as any)
        .eq("provider", provider)
        .eq("event_id", eventId)

      if (markErr) {
        console.error("[AUDITOR_PROCESS] failed to mark processed", {
          eventId,
          code: (markErr as any)?.code,
          message: (markErr as any)?.message,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results, ms: Date.now() - t0 })
}

export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}