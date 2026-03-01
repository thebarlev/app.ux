export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { createServiceRoleClient } from "@/lib/supabase/server"

const bodySchema = z.object({
  leadId: z.string().uuid(),
  companyId: z.string().uuid(),
  tier: z.enum(["basic", "pro"]),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  try {
    await requireSystemAdmin()
  } catch (e: any) {
    const code = String(e?.code || e?.message || "")
    const status = code === "unauthorized" ? 401 : 403
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const admin = createServiceRoleClient()
  const now = new Date()
  const frequencyDays = parsed.data.tier === "pro" ? 7 : 14
  const nextRunAt = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000).toISOString()

  // (a) update lead
  await admin.from("auditor_leads").update({ company_id: parsed.data.companyId }).eq("id", parsed.data.leadId)

  // (b) update scans for lead
  await admin
    .from("auditor_scans")
    .update({ company_id: parsed.data.companyId })
    .eq("lead_id", parsed.data.leadId)

  // (c) upsert schedules for each host in scans for that lead
  const { data: hosts } = await admin
    .from("auditor_scans")
    .select("normalized_host")
    .eq("lead_id", parsed.data.leadId)
    .not("normalized_host", "is", null)

  const uniqueHosts = Array.from(new Set((hosts || []).map((r: any) => String(r.normalized_host)).filter(Boolean)))
  if (uniqueHosts.length > 0) {
    const rows = uniqueHosts.map((h) => ({
      company_id: parsed.data.companyId,
      normalized_host: h,
      tier: parsed.data.tier,
      frequency_days: frequencyDays,
      next_run_at: nextRunAt,
      is_active: true,
      updated_at: now.toISOString(),
    }))
    await admin.from("auditor_scan_schedules").upsert(rows, { onConflict: "company_id,normalized_host" })
  }

  return NextResponse.json({ ok: true, linkedHosts: uniqueHosts.length, frequencyDays, nextRunAt })
}

