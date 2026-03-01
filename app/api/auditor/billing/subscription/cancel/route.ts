export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"

export async function POST() {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const companyId = await getCompanyIdForUser()
  const admin = createServiceRoleClient()

  const nowIso = new Date().toISOString()
  const { data: sub } = await admin
    .from("auditor_subscriptions")
    .update({
      cancel_at_period_end: true,
      canceled_at: nowIso,
    } as any)
    .eq("company_id", companyId)
    .select("company_id,plan_id,status,current_period_end,cancel_at_period_end,canceled_at")
    .maybeSingle()

  if (!sub) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true, subscription: sub })
}

