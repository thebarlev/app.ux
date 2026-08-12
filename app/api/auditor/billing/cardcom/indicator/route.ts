export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { isCheckoutEnabled } from "@/lib/auditor/billing/checkout-gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
/*
 * Gated by the checkout gate, not by a literal.
 *
 * This route is called by Cardcom from the internet, so it cannot be behind auth —
 * which makes the gate the only thing keeping it shut. isCheckoutEnabled() fails
 * closed on an unset, empty or malformed flag, and keeps production closed even when
 * the flag is on until AUDITOR_CHECKOUT_ALLOW_PRODUCTION says otherwise. Eleven tests
 * observe those refusals.
 */


/**
 * Every incoming call is recorded, including the refused ones.
 *
 * A structured log line and NOT a row in auditor_billing_events, deliberately. That
 * table's primary key is (provider, event_id) and its contract is "this row is one real
 * event from Cardcom". A refused call has no event_id — it is derived from
 * lowProfileCode, which may be exactly what is missing — and inventing one would break
 * the contract twice: the key stops meaning anything, and anyone reading the table
 * later assumes a row equals an event. A row that lies about what it is is worse than
 * no row.
 *
 * One fixed prefix so it is greppable, and enough per line to answer "who is knocking":
 * reason, IP, whether a lowProfileCode was present at all, and when.
 *
 * ⚠️ A dedicated auditor_indicator_rejections table is a post-launch item, warranted
 * only if real traffic turns up here — and by then we will know what shape it needs.
 */
function logRejection(req: Request, reason: string, lowProfileCode: string | null): void {
  console.warn("[AUDITOR_INDICATOR_REJECT]", {
    reason,
    ip:
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for") ||
      "unknown",
    hadLowProfileCode: Boolean(lowProfileCode),
    // Logged for debugging only. It is trivially spoofable and is never a condition.
    userAgent: req.headers.get("user-agent") || null,
    cronSchedule: req.headers.get("x-vercel-cron-schedule") || null,
    at: new Date().toISOString(),
  })
}

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
  // AUDITOR BLOCKED — first statement executed in this handler.
  const url0 = new URL(req.url)
  if (!isCheckoutEnabled()) {
    logRejection(req, "checkout_disabled", url0.searchParams.get("lowprofilecode"))
    return new NextResponse(null, { status: 404 })
  }

  const t0 = Date.now()
  const url = url0

  const terminalnumber = url.searchParams.get("terminalnumber")
  const lowProfileCode =
    getFirstSearchParam(url, ["lowprofilecode", "LowProfileCode"]) || getFirstSearchParam(url, ["lowProfileCode"]) || null

  console.log("[AUDITOR_INDICATOR] start", { terminalnumber, lowProfileCode, ms: Date.now() - t0 })

  const cfg = getAuditorConfig()
  if (!cfg.enabled) {
    logRejection(req, "auditor_disabled", lowProfileCode)
    return new NextResponse(null, { status: 404 })
  }

  // Cardcom expects HTTP 200; keep response minimal.
  if (!lowProfileCode) {
    logRejection(req, "missing_lowprofilecode", null)
    return NextResponse.json({ ok: true, status: "ignored", message: "Missing lowprofilecode" })
  }

  const admin = createAdminClient()
  const providerKey = "cardcom"
  const eventId = `cardcom:indicator:${lowProfileCode}`

  // 1) Quick idempotent insert - store raw query for async processing
  console.log("[AUDITOR_INDICATOR] before insert", Date.now() - t0)
  try {
    const { error: evErr } = await admin.from("auditor_billing_events").insert({
      provider: providerKey,
      event_id: eventId,
      status: "received",
      payload: { query: Object.fromEntries(url.searchParams.entries()) },
    } as any)
    // ignore duplicates (23505) - Cardcom may retry
    if (evErr && String((evErr as any)?.code || "") !== "23505") {
      console.warn("[AUDITOR_INDICATOR] insert warning", { error: (evErr as any)?.message, ms: Date.now() - t0 })
    }
  } catch (e) {
    console.warn("[AUDITOR_INDICATOR] insert exception", { error: e, ms: Date.now() - t0 })
    // still return 200 - Cardcom must not retry indefinitely
  }
  console.log("[AUDITOR_INDICATOR] after insert", Date.now() - t0)

  // 2) Immediate response - Cardcom expects HTTP 200
  return NextResponse.json({ ok: true })
}
