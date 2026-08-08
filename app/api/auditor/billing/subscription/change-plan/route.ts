export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


const bodySchema = z.object({
  plan_id: z.enum(["basic", "pro", "premium"]),
})

export async function POST(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (AUDITOR_BLOCKED) return new NextResponse(null, { status: 404 })

  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const companyId = await getCompanyIdForUser()
  const admin = createServiceRoleClient()

  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id,name,monthly_amount,currency,is_active")
    .eq("id", parsed.data.plan_id)
    .eq("is_active", true)
    .maybeSingle()

  if (!plan) return NextResponse.json({ ok: false, error: "Plan not available" }, { status: 400 })

  const nowIso = new Date().toISOString()
  const { data: sub } = await admin
    .from("auditor_subscriptions")
    .update({
      plan_id: plan.id,
      plan_snapshot_name: plan.name,
      plan_snapshot_monthly_amount: plan.monthly_amount,
      plan_snapshot_currency: plan.currency || "ILS",
      plan_snapshot_created_at: nowIso,
    } as any)
    .eq("company_id", companyId)
    .select("company_id,plan_id,status,next_billing_date,current_period_end")
    .maybeSingle()

  if (!sub) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true, subscription: sub, effective: "next_cycle" })
}

