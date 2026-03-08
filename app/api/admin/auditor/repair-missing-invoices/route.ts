export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret")
  if (!secret || secret !== process.env.AUDITOR_REPAIR_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const chargeId: string | undefined = body?.chargeId

  if (!chargeId) {
    return NextResponse.json({ ok: false, error: "missing chargeId" }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc(
    "issue_auditor_charge_invoice_receipt_service",
    {
      p_auditor_charge_id: chargeId,
      p_issuer_company_id: process.env.VOW_BILLING_COMPANY_ID
    }
  )

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    result: data
  })
}