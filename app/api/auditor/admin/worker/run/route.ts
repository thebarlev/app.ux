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

function isVercelCron(req: Request): boolean {
  // Vercel Cron always sends user-agent starting with "vercel-cron/" and an
  // x-vercel-cron-schedule header. Implicit auth from the platform.
  const ua = req.headers.get("user-agent") || ""
  if (ua.startsWith("vercel-cron/")) return true
  if (req.headers.get("x-vercel-cron-schedule")) return true
  return false
}

function checkSecret(req: Request): boolean {
  if (isVercelCron(req)) return true

  const expected = String(process.env.AUDITOR_WORKER_SECRET || "").trim()
  const cronExpected = String(process.env.AUDITOR_CRON_SECRET || "").trim()
  if (!expected && !cronExpected) return false
  const got = String(req.headers.get("x-auditor-worker-secret") || "").trim()
  const gotBearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  return got === expected || gotBearer === expected || got === cronExpected || gotBearer === cronExpected
}

async function handler(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf
  if (!checkSecret(req)) return unauthorized()

  const admin = createServiceRoleClient()

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

  return NextResponse.json({ ok: true, progressed })
}

// Vercel Cron uses GET. External callers can POST.
export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}

