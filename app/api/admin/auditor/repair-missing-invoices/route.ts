export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorIssuerCompanyId } from "@/lib/auditor/billing/env"

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

  // One source of truth for the issuing dealer, shared with every other auditor
  // path. This route used to resolve `VOW_BILLING_COMPANY_ID ||
  // AUDITOR_BILLING_ACCOUNT_ID` — the opposite precedence to the main path — so the
  // same charge could be invoiced under two different companies depending on which
  // route repaired it. VOW_BILLING_COMPANY_ID belongs to the invoicing product and
  // does not decide who owns an auditor document.
  //
  // getAuditorIssuerCompanyId throws when the variable is missing or not a UUID.
  // That is deliberate: a repair that guesses the dealer is worse than a repair
  // that refuses to run.
  let issuerId: string
  try {
    issuerId = getAuditorIssuerCompanyId()
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "AUDITOR_BILLING_ACCOUNT_ID is not configured" },
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