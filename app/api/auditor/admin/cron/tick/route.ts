export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
}

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

function checkSecret(req: Request): boolean {
  const expected = String(process.env.AUDITOR_CRON_SECRET || process.env.AUDITOR_WORKER_SECRET || "").trim()
  if (!expected) return false
  const got = String(req.headers.get("x-auditor-worker-secret") || "").trim()
  const gotBearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  return got === expected || gotBearer === expected
}

export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf
  if (!checkSecret(req)) return unauthorized()

  const admin = createServiceRoleClient()
  const now = new Date()

  const { data: due } = await admin
    .from("auditor_scan_schedules")
    .select("id,company_id,normalized_host,frequency_days,tier,is_active,next_run_at")
    .eq("is_active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(25)

  const rows = Array.isArray(due) ? due : []
  let enqueued = 0

  for (const s of rows) {
    const companyId = String((s as any).company_id)
    const normalizedHost = String((s as any).normalized_host)
    const frequencyDays = Number((s as any).frequency_days) || 14

    // Create a scheduled scan row (no customer token).
    const { error: insErr } = await admin.from("auditor_scans").insert({
      company_id: companyId,
      created_by_user_id: null,
      lead_id: null,
      lead_email_normalized: null,
      created_by_role: "system",
      scan_kind: "scheduled",
      scan_access_token: null,
      status: "queued",
      step: "normalize",
      target_url: `https://${normalizedHost}`,
      normalized_url: null,
      hostname: null,
      normalized_host: normalizedHost,
      artifacts: {},
      coverage: {},
      confidence: {},
      report_public: {},
      report_admin: {},
    } as any)

    if (!insErr) enqueued += 1

    const nextRun = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000).toISOString()
    await admin
      .from("auditor_scan_schedules")
      .update({ last_run_at: now.toISOString(), next_run_at: nextRun, updated_at: now.toISOString() })
      .eq("id", (s as any).id)
  }

  return NextResponse.json({ ok: true, due: rows.length, enqueued })
}

