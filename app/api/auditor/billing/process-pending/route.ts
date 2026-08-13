export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { isCheckoutEnabled } from "@/lib/auditor/billing/checkout-gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"
import { deliverAuditorInvoiceEmail } from "@/lib/auditor/billing/deliver-invoice-email"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
/*
 * Gated by the checkout gate, not a literal.
 *
 * This route creates charges, subscriptions, tokens and tax documents from events
 * Cardcom already reported, so it must be shut wherever the checkout is shut. The gate
 * fails closed on unset, empty and malformed, and keeps production closed until a
 * second explicit variable says otherwise.
 */


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

  /*
   * Two accepted secrets, and the resolution is deliberate.
   *
   * Vercel's cron sends `Authorization: Bearer $CRON_SECRET` automatically, and only
   * for a variable named exactly CRON_SECRET — that is documented platform behaviour,
   * not a convention we chose. Manual runs (the stage-3 test round) use
   * AUDITOR_BILLING_CRON_SECRET instead, because a human should not need the cron's
   * secret to drive a route by hand.
   *
   * ⚠️ Built as a list of NON-EMPTY secrets rather than two separate comparisons, and
   * that is the lesson from app/api/auditor/admin/worker/run: with only one of two
   * variables set, the other resolves to "" and an absent header would satisfy
   * `"" === ""` and authenticate. Filtering first makes that impossible, and an empty
   * list refuses everything.
   */
  const accepted = [CRON_SECRET, process.env.AUDITOR_BILLING_CRON_SECRET, process.env.CRON_SECRET]
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
  if (accepted.length === 0) return false
  if (got && accepted.includes(got)) return true
  return false
}


/*
 * ── THE COMPLETION SWEEP ─────────────────────────────────────────────────────
 *
 * ⛔ THIS IS WHAT MAKES "החשבונית תישלח תוך מספר דקות" A TRUE SENTENCE.
 *
 * The thank-you page says that when no 'emailed' event exists for the document. Before
 * this sweep, nothing would ever send it: the issuance path got one attempt, and when it
 * failed — as it did on invoice 1003 — the event was already marked ok and no code ever
 * looked again. A promise with no mechanism is the same lie the page was just fixed for,
 * pointed one step further down the flow.
 *
 * ── THE QUEUE IS DERIVED, NOT MAINTAINED ────────────────────────────────────
 * No new table, no new column, no new cron. "An issued invoice with no 'emailed' event"
 * is a fact about existing rows, so the queue cannot drift from reality, cannot hold
 * stale entries, and needs no migration. A document leaves it by being delivered — the
 * same event the success page reads, so the page and the queue can never disagree.
 *
 * ── THE WINDOW ──────────────────────────────────────────────────────────────
 * Charges from the last SWEEP_WINDOW_DAYS days only. Not the whole history: this runs
 * every five minutes forever, and a permanent failure from a year ago would be retried
 * eight and a half thousand times a month. The window is also the outer bound — a
 * document that ages out stops being attempted, which is what stops this running to
 * infinity.
 *
 * ⚠️ AND HERE IS WHAT I COULD NOT BUILD, STATED PLAINLY.
 *
 * The requirement was a counted bound: after N attempts, a loud error and an operator
 * email — the same discipline as the three attempts on an event. That needs somewhere to
 * keep the count, and the instruction was to check document_events.event_type before
 * assuming one exists.
 *
 * It does not. Migration 034 replaced 006's constraint with sixteen values —
 * created, updated, finalized, cancelled, voided, signed, pdf_generated, emailed,
 * printed, viewed, consent_given, consent_revoked, original_issued, copy_downloaded,
 * pdf_recovered, backup_ran — and not one of them means "attempted" or "failed".
 * Recording a failure as 'emailed' with a flag in event_data would be worse than no
 * record: the sweep's own queue query looks for any 'emailed' row, so a failure marker
 * would make an undelivered document look delivered and remove it from the queue
 * permanently.
 *
 * So the bound here is the WINDOW, not a count, and every failing document is logged on
 * every pass rather than escalated once. What is missing is the single operator email at
 * a threshold. That needs a place to live, and inventing one was explicitly off the
 * table. Reported instead.
 */
const SWEEP_WINDOW_DAYS = 3
/** Per-run cap. PDF generation is the heaviest thing in this route; the cron is every 5 min. */
const SWEEP_MAX_PER_RUN = 5

type SweepResult = {
  document_id: string
  document_number: string | null
  sent: boolean
  reason?: string
  /*
   * Returned so a staged run can be checked without database access. issue_date is the
   * value the PDF actually renders from — every date in the template is built from
   * doc.issue_date — so comparing it against created_at answers "does the regenerated
   * file agree with its own document row" from the response alone.
   */
  issue_date?: string | null
  created_at?: string | null
  pdf_bytes?: number | null
}

/**
 * @param onlyDocumentId when set, the sweep attempts exactly that document and nothing
 *   else. Added for staged rollout: the first recovery render had to be checked on one
 *   test-company invoice before being let loose on the rest, and a run capped at N would
 *   have picked whichever charge happened to be oldest instead. The route is already
 *   behind the cron secret, so this adds no new surface.
 */
async function sweepUnsentInvoices(
  admin: ReturnType<typeof createAdminClient>,
  onlyDocumentId?: string
): Promise<SweepResult[]> {
  const out: SweepResult[] = []
  try {
    const since = new Date(Date.now() - SWEEP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: charges, error: chErr } = await admin
      .from("auditor_subscription_charges")
      .select("id, company_id, plan_id, amount, currency, issued_invoice_id, created_at")
      .not("issued_invoice_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })

    if (chErr) {
      console.error("[AUDITOR_SWEEP] could not read charges", { error: String((chErr as any)?.message || chErr) })
      return out
    }
    const rows = (charges as any[]) || []
    if (rows.length === 0) return out

    const invoiceIds = rows.map((r) => String(r.issued_invoice_id))

    // One query for the whole window rather than one per document.
    const { data: emailedRows, error: evErr } = await admin
      .from("document_events")
      .select("document_id")
      .eq("event_type", "emailed")
      .in("document_id", invoiceIds)

    if (evErr) {
      /*
       * ⛔ Fail CLOSED. If we cannot tell which invoices were already emailed, sending is
       * the wrong guess: it would mail every invoice in the window again on every pass.
       * Silence for one tick is recoverable; a mail storm to real customers is not.
       */
      console.error("[AUDITOR_SWEEP] could not read document_events — sending nothing this pass", {
        error: String((evErr as any)?.message || evErr),
      })
      return out
    }

    const alreadyEmailed = new Set(((emailedRows as any[]) || []).map((r) => String(r.document_id)))
    let queue = rows.filter((r) => !alreadyEmailed.has(String(r.issued_invoice_id)))
    if (onlyDocumentId) {
      queue = queue.filter((r) => String(r.issued_invoice_id) === onlyDocumentId)
      console.log("[AUDITOR_SWEEP] restricted to a single document", { onlyDocumentId, matched: queue.length })
    }
    if (queue.length === 0) return out

    console.log("[AUDITOR_SWEEP] invoices with no emailed event", {
      inWindow: rows.length,
      queued: queue.length,
      attemptingNow: Math.min(queue.length, SWEEP_MAX_PER_RUN),
      windowDays: SWEEP_WINDOW_DAYS,
    })

    for (const charge of queue.slice(0, SWEEP_MAX_PER_RUN)) {
      const documentId = String(charge.issued_invoice_id)
      const companyId = charge.company_id ? String(charge.company_id) : ""

      const { data: doc } = await admin
        .from("documents")
        .select("document_number, company_id, issue_date, created_at")
        .eq("id", documentId)
        .maybeSingle()

      const documentNumber = (doc as any)?.document_number ? String((doc as any).document_number) : null
      if (!documentNumber) {
        console.error("[AUDITOR_SWEEP] issued invoice has no document_number", { documentId, chargeId: charge.id })
        out.push({ document_id: documentId, document_number: null, sent: false, reason: "no_document_number" })
        continue
      }

      // The buyer's company, for the address and for is_test — not the issuer's.
      const { data: buyer, error: bErr } = await admin
        .from("companies")
        .select("email, is_test")
        .eq("id", companyId)
        .maybeSingle()

      // Same asymmetry as the operator notices: unreadable means treat it as a test, so
      // an unmarked invoice never reaches a real inbox by accident.
      const isTest = (buyer as any)?.is_test === false ? false : true
      if (bErr || !buyer) {
        console.error("[AUDITOR_SWEEP] buyer company unreadable — marking the notice as a test", {
          companyId,
          documentId,
          error: bErr ? String((bErr as any)?.message || bErr) : "no row",
        })
      }

      const { data: plan } = await admin
        .from("auditor_plans")
        .select("name")
        .eq("id", String(charge.plan_id))
        .maybeSingle()

      const r = await deliverAuditorInvoiceEmail(admin, {
        documentId,
        documentNumber,
        to: String((buyer as any)?.email || ""),
        isTest,
        planName: (plan as any)?.name ? String((plan as any).name) : null,
        amount: charge.amount === null || charge.amount === undefined ? null : Number(charge.amount),
        currency: charge.currency ? String(charge.currency) : "ILS",
        // The document belongs to the issuing dealer; document_events.company_id follows
        // documents.company_id, which the 3-arg issuance function sets to the issuer.
        issuerCompanyId: String((doc as any)?.company_id || getAuditorBillingConfig().billingAccountId),
      })

      out.push({
        document_id: documentId,
        document_number: documentNumber,
        sent: r.sent,
        reason: r.reason,
        issue_date: (doc as any)?.issue_date ?? null,
        created_at: (doc as any)?.created_at ?? null,
        pdf_bytes: r.pdfBytes ?? null,
      })
    }
  } catch (e: any) {
    // The sweep is a best-effort tail. It must never take down event processing, which is
    // what actually turns a payment into a subscription.
    console.error("[AUDITOR_SWEEP] threw", { error: String(e?.message || e) })
  }
  return out
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

  /*
   * After the events, not instead of them. Event processing is what turns a payment into
   * a subscription; the sweep only chases a tail. If the cap or the window drops
   * something it is logged above rather than silently omitted.
   */
  const onlyDocumentId = new URL(req.url).searchParams.get("documentId")?.trim() || undefined
  const swept = await sweepUnsentInvoices(admin, onlyDocumentId)

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    swept: swept.length,
    sweep: swept,
    ms: Date.now() - t0,
  })
}

export async function GET(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (!isCheckoutEnabled()) return new NextResponse(null, { status: 404 })

  return handler(req)
}

export async function POST(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (!isCheckoutEnabled()) return new NextResponse(null, { status: 404 })

  return handler(req)
}