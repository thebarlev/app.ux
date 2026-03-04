/**
 * Admin-only: Issue invoices for auditor charges that succeeded but have no issued_invoice_id.
 * POST /api/admin/auditor/repair-missing-invoices
 * Body: { chargeId?: string } — if omitted, repairs all charges missing invoice
 *
 * Fixes charges where process-indicator-event RPC failed (timeout, sequence error, etc).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"
import { generateDocumentPDF } from "@/lib/pdf-service"

export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const secret = process.env.AUDITOR_REPAIR_SECRET
  const got = req.headers.get("x-admin-secret") || ""

  if (!secret || got !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const chargeId = typeof body?.chargeId === "string" ? body.chargeId.trim() : null

  const admin = createServiceRoleClient()
  const billingCfg = getAuditorBillingConfig()

  let charges: { id: string }[] = []
  if (chargeId) {
    const { data: c } = await admin
      .from("auditor_subscription_charges")
      .select("id")
      .eq("id", chargeId)
      .eq("status", "succeeded")
      .is("issued_invoice_id", null)
      .maybeSingle()
    if (c?.id) charges = [{ id: c.id }]
    else if (chargeId) {
      const { data: exists } = await admin
        .from("auditor_subscription_charges")
        .select("id, issued_invoice_id")
        .eq("id", chargeId)
        .maybeSingle()
      if (!exists) return NextResponse.json({ error: "Charge not found" }, { status: 404 })
      if (exists.issued_invoice_id)
        return NextResponse.json({ ok: true, message: "Charge already has invoice", chargeId })
      return NextResponse.json({ error: "Charge status not succeeded or not eligible" }, { status: 400 })
    }
  } else {
    const { data: list } = await admin
      .from("auditor_subscription_charges")
      .select("id")
      .eq("status", "succeeded")
      .is("issued_invoice_id", null)
      .order("subscription_period_start", { ascending: false })
      .limit(50)
    charges = (list || []).map((c: any) => ({ id: c.id }))
  }

  const results: { chargeId: string; ok: boolean; documentId?: string; error?: string }[] = []

  for (const { id: cId } of charges) {
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc("issue_auditor_charge_invoice_receipt_service", {
        p_auditor_charge_id: cId,
        p_issuer_company_id: billingCfg.billingAccountId,
      } as any)
      const ok = Array.isArray(rpcData) && rpcData[0]?.ok === true
      const documentId = ok && rpcData[0]?.document_id ? String(rpcData[0].document_id) : null
      const errMsg = rpcErr ? String((rpcErr as any)?.message || rpcErr) : "rpc returned not-ok"

      if (!ok) {
        results.push({ chargeId: cId, ok: false, error: errMsg })
        continue
      }

      if (documentId) {
        const [origRes, copyRes] = await Promise.allSettled([
          generateDocumentPDF(documentId, {
            language: "he",
            mode: "recovery",
            context: "issue",
            variant: "original",
            isIssuance: true,
            requestId: `repair-orig-${cId}`,
          }),
          generateDocumentPDF(documentId, {
            language: "he",
            mode: "recovery",
            context: "download",
            variant: "copy",
            isIssuance: true,
            requestId: `repair-copy-${cId}`,
          }),
        ])
        const pdfOk = origRes.status === "fulfilled" && origRes.value?.success
        if (!pdfOk && origRes.status === "fulfilled" && origRes.value?.error) {
          results.push({ chargeId: cId, ok: true, documentId, error: `PDF: ${origRes.value.error}` })
        } else {
          results.push({ chargeId: cId, ok: true, documentId })
        }
      } else {
        results.push({ chargeId: cId, ok: true })
      }
    } catch (e: any) {
      results.push({ chargeId: cId, ok: false, error: String(e?.message || e) })
    }
  }

  const repaired = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  return NextResponse.json({
    ok: failed.length === 0,
    repaired,
    total: charges.length,
    failed: failed.length,
    results,
  })
}
