export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
})

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function isAllowedRpcRow(row: any): row is { allowed: boolean; new_count: number; remaining: number } {
  return row && typeof row.allowed === "boolean"
}

export async function POST(req: Request) {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const supabase = await createClient()
  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 })
  }

  const day = todayYmd()

  // Global limit
  const { data: gData, error: gErr } = await supabase.rpc("auditor_inc_global_daily_usage", {
    p_day: day,
    p_limit: access.config.globalDailyLimit,
  })
  if (gErr) {
    console.error("[auditor] global usage rpc failed", { message: gErr.message, code: gErr.code })
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
  const gRow = Array.isArray(gData) ? gData[0] : null
  if (!isAllowedRpcRow(gRow) || !gRow.allowed) {
    return NextResponse.json({ ok: false, error: "Daily global limit exceeded" }, { status: 429 })
  }

  // Per-user-per-company limit
  const { data: uData, error: uErr } = await supabase.rpc("auditor_inc_user_daily_usage", {
    p_company_id: access.companyId,
    p_day: day,
    p_limit: access.config.dailyScanLimit,
  })
  if (uErr) {
    console.error("[auditor] user usage rpc failed", { message: uErr.message, code: uErr.code })
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
  const uRow = Array.isArray(uData) ? uData[0] : null
  if (!isAllowedRpcRow(uRow) || !uRow.allowed) {
    return NextResponse.json({ ok: false, error: "Daily user limit exceeded" }, { status: 429 })
  }

  const targetUrl = parsed.data.url.trim()

  const { data: scan, error } = await supabase
    .from("auditor_scans")
    .insert({
      company_id: access.companyId,
      created_by_user_id: access.user.id,
      target_url: targetUrl,
      page_limit: 10,
      status: "queued",
      step: "normalize",
      artifacts: {},
      score_breakdown: {},
    })
    .select("id")
    .single()

  if (error || !scan?.id) {
    console.error("[auditor] failed to create scan", { message: error?.message, code: (error as any)?.code })
    return NextResponse.json({ ok: false, error: "Failed to create scan" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    scanId: scan.id,
    limits: {
      globalRemaining: gRow.remaining,
      userRemaining: uRow.remaining,
    },
  })
}

export async function GET() {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("auditor_scans")
    .select("id,target_url,normalized_url,hostname,status,step,score_total,score_breakdown,created_at,started_at,finished_at,error")
    .eq("company_id", access.companyId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to load scans" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, scans: data || [] })
}

