export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"
import { runReportEmailPass } from "@/lib/auditor/report/email-worker"

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
}

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

// NOTE: there is deliberately no user-agent / x-vercel-cron-schedule check here.
// Both headers are fully client-controlled, so `curl -H "user-agent: vercel-cron/1.0"`
// authenticated as the platform on a route that runs with the service role.
// The shared secret is the only accepted proof. Fails closed when unset.
// Resolved into a single `expected` (the app/api/auditor/admin/cron/tick shape).
// Keeping two separate comparisons would be unsafe here: with only one of the two
// variables set, the other resolves to "" and an absent header ("" === "") would
// authenticate. The user-agent bypass used to mask that; it no longer can.
function checkSecret(req: Request): boolean {
  const expected = String(
    process.env.AUDITOR_WORKER_SECRET || process.env.AUDITOR_CRON_SECRET || ""
  ).trim()
  if (!expected) return false
  const got = String(req.headers.get("x-auditor-worker-secret") || "").trim()
  const gotBearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  return got === expected || gotBearer === expected
}

async function handler(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf
  if (!checkSecret(req)) return unauthorized()

  const admin = createServiceRoleClient()

  /*
   * The report-email pass rides this tick rather than getting a cron of its own.
   *
   * A second cron would mean a new route and a new vercel.json entry; neither is
   * on the table, and this tick already runs every two minutes with the right
   * client and the right auth. It goes first and takes a small fixed slice: the
   * scan loop below will happily consume all 50 seconds whenever there is work,
   * so anything queued behind it would be starved on exactly the busy days it
   * matters. Eight seconds is enough for a batch of ten and leaves the scan loop
   * with 42 of its 50.
   *
   * Sending is still off — the pass renders and logs and stamps nothing while
   * AUDITOR_REPORT_EMAIL_ENABLED is not "true".
   */
  const emailPass = await runReportEmailPass({ supabase: admin, budgetMs: 8_000, limit: 10 })

  /*
   * 50s of the 60s this route is given in vercel.json, matching the margin the
   * /continue route keeps.
   *
   * A full scan is 18 steps and roughly 36-72s of actual work. At the previous
   * 9s the limit was not load, it was waiting: the tick spent 9 seconds working
   * and then handed the scan back to a 2-minute cron gap, stretching a
   * one-minute scan across 8-16 minutes with 85% of the function budget unused.
   * Cost is unchanged — the same work either way, and the loop takes one scan
   * per pass, so nothing runs concurrently. Full scans now land in ~2-4 min.
   *
   * Worth revisiting only if many scans queue at once: one long pass is less
   * fair to the others than several short ones. Not a concern at current volume.
   */
  const budgetMs = 50_000
  const started = Date.now()
  let progressed = 0

  while (Date.now() - started < budgetMs) {
    // Pick next scan to progress (queued, or running with stale heartbeat)
    const staleBefore = new Date(Date.now() - 60_000).toISOString()
    const { data: scan } = await admin
      .from("auditor_scans")
      .select("id,status,heartbeat_at")
      .or(`status.eq.queued,and(status.eq.running,heartbeat_at.is.null),and(status.eq.running,heartbeat_at.lt.${staleBefore})`)
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!scan?.id) break

    // Try progress one step (includes lock acquisition).
    const res = await continueAuditorScan({ scanId: String(scan.id), supabase: admin })
    if (res.ok) {
      progressed += 1
      continue
    }
    if (!res.ok && res.kind === "busy") {
      // try another scan in next loop
      continue
    }
    // invalid state: stop to avoid tight loop
    break
  }

  return NextResponse.json({ ok: true, progressed, reportEmail: emailPass })
}

// Vercel Cron uses GET. External callers can POST.
export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}

