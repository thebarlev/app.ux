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

  // Fetch charge to infer p_is_en (USD = EN flow → tax_invoice; ILS = Hebrew → invoice_receipt)
  const { data: charge } = await supabase
    .from("auditor_subscription_charges")
    .select("currency")
    .eq("id", chargeId)
    .eq("status", "succeeded")
    .maybeSingle()

  const isEn = (charge as any)?.currency === "USD"
  const issuerId =
    process.env.VOW_BILLING_COMPANY_ID || process.env.AUDITOR_BILLING_ACCOUNT_ID
  if (!issuerId) {
    return NextResponse.json(
      { ok: false, error: "Missing VOW_BILLING_COMPANY_ID or AUDITOR_BILLING_ACCOUNT_ID" },
      { status: 500 }
    )
  }

  const { data, error } = await supabase.rpc(
    "issue_auditor_charge_invoice_receipt_service",
    {
      p_auditor_charge_id: chargeId,
      p_issuer_company_id: issuerId,
      p_is_en: isEn,
    } as any
  )

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    result: data
  })
}