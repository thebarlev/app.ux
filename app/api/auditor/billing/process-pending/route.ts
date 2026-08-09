export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


const BATCH_LIMIT = 3
const MAX_MS = 240_000 // stop before 300s Vercel limit

// Read once (avoid throwing inside auth checks)
let CRON_SECRET: string | null = null
try {
  CRON_SECRET = getAuditorBillingConfig().cronSecret || null
} catch {
  CRON_SECRET = null
}

// NOTE: there is deliberately no user-agent / x-vercel-cron-schedule check here.
// Both headers are fully client-controlled, so `curl -H "user-agent: vercel-cron/1.0"`
// authenticated as the platform on a route that runs with the service role and
// processes Cardcom billing events. The shared secret is the only accepted proof.
// Fails closed when CRON_SECRET is unset.
function isAuthorized(req: Request): boolean {
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

    try {
      const r = await processCardcomIndicatorEvent(admin, eventId, payload)
      results.push({ event_id: eventId, ok: !!r.ok, error: r.error })
    } catch (e: any) {
      console.error("[AUDITOR_PROCESS] event failed", { eventId, error: String(e?.message || e) })
      results.push({ event_id: eventId, ok: false, error: String(e?.message || e) })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results, ms: Date.now() - t0 })
}

export async function GET(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (AUDITOR_BLOCKED) return new NextResponse(null, { status: 404 })

  return handler(req)
}

export async function POST(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (AUDITOR_BLOCKED) return new NextResponse(null, { status: 404 })

  return handler(req)
}