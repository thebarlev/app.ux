export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { getAuditorConfig } from "@/lib/auditor/env"

export async function GET() {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  let companyId: string
  try {
    companyId = await getCompanyIdForUser()
  } catch {
    return NextResponse.json({ ok: false, error: "No company" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  const { data: charges } = await admin
    .from("auditor_subscription_charges")
    .select("id, subscription_period_start, subscription_period_end, amount, currency, status, issued_invoice_id")
    .eq("company_id", companyId)
    .eq("status", "succeeded")
    .order("subscription_period_start", { ascending: false })
    .limit(50)

  if (!charges || charges.length === 0) {
    return NextResponse.json({ ok: true, invoices: [] })
  }

  const docIds = (charges as any[])
    .map((c) => c.issued_invoice_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  let docNumbers: Record<string, string> = {}
  if (docIds.length > 0) {
    const { data: docs } = await admin
      .from("documents")
      .select("id, document_number")
      .in("id", docIds)
    if (docs) {
      for (const d of docs as any[]) {
        docNumbers[d.id] = String(d.document_number || "")
      }
    }
  }

  const invoices = (charges as any[]).map((c) => ({
    id: c.id,
    period_start: c.subscription_period_start,
    period_end: c.subscription_period_end,
    amount: c.amount,
    currency: c.currency,
    document_id: c.issued_invoice_id,
    document_number: c.issued_invoice_id ? docNumbers[c.issued_invoice_id] || null : null,
  }))

  return NextResponse.json({ ok: true, invoices })
}
