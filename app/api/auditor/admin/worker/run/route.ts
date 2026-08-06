export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"

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

  const budgetMs = 9_000
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

  return NextResponse.json({ ok: true, progressed })
}

// Vercel Cron uses GET. External callers can POST.
export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}

