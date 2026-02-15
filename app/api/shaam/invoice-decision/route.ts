export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { callShaamInvoiceDecision, type ShaamInvoiceDecisionType } from "@/lib/shaam/invoice-decision"
import { getDecryptedTokensForCompany, markConnectionError, recordShaamEvent, refreshShaamTokenManual } from "@/lib/shaam/tokens"
import { markDocumentCancelledAction } from "@/lib/documents/actions"

function reqEnvInt(name: string): number {
  const raw = String(process.env[name] || "").trim()
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Missing or invalid ${name}`)
  }
  return n
}

function parseDecision(input: any): ShaamInvoiceDecisionType | null {
  const s = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (s === "CANCEL" || s === "CONTINUE" || s === "FURTHEROBJECTION") return s
  return null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const documentId = typeof body?.document_id === "string" ? body.document_id.trim() : ""
  const decision = parseDecision(body?.decision)

  if (!documentId) {
    return NextResponse.json({ ok: false, message: "missing_document_id" }, { status: 400 })
  }
  if (!decision) {
    return NextResponse.json({ ok: false, message: "invalid_decision" }, { status: 400 })
  }

  const companyId = await resolveCurrentCompanyId()
  const admin = createAdminClient()

  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("id, company_id, document_type, document_number, allocation_status, shaam_error_id")
    .eq("id", documentId)
    .maybeSingle()

  if (docError || !doc) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 })
  }
  if (String((doc as any).company_id) !== companyId) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
  }

  // Only allow for the two regulated doc types.
  const docType = String((doc as any).document_type || "")
  if (docType !== "tax_invoice" && docType !== "invoice_receipt") {
    return NextResponse.json({ ok: false, message: "not_supported_for_document_type" }, { status: 400 })
  }

  // Issuer VAT number (digits-only from existing company fields)
  const { data: companyRow } = await admin
    .from("companies")
    .select("tax_id, registration_number, company_number")
    .eq("id", companyId)
    .maybeSingle()

  const issuerTaxIdRaw =
    (companyRow as any)?.tax_id || (companyRow as any)?.registration_number || (companyRow as any)?.company_number || ""
  const issuerVatDigits = String(issuerTaxIdRaw || "").replace(/\D/g, "")
  const vatNumber = issuerVatDigits ? Number(issuerVatDigits) : NaN
  if (!Number.isInteger(vatNumber) || vatNumber <= 0) {
    return NextResponse.json({ ok: false, message: "missing_company_vat_number" }, { status: 400 })
  }

  // accounting_software_number (required env fallback; no repo setting found)
  const accountingSoftwareNumber = reqEnvInt("SHAAM_ACCOUNTING_SOFTWARE_NUMBER")

  const docNumber = (doc as any).document_number ? String((doc as any).document_number).trim() : ""
  const invoiceId = docNumber && docNumber.length <= 50 ? docNumber : String(documentId)

  // Optional user info (nullable by spec)
  const userName =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    (user.email ? String(user.email) : null) ||
    null

  const makeCall = async () => {
    const tokens = await getDecryptedTokensForCompany({ companyId })
    if (!tokens.ok) return { ok: false as const, kind: "unauthorized" as const, provider_json: { error: "not_connected" } }
    return await callShaamInvoiceDecision({
      accessToken: tokens.accessToken,
      decision,
      payload: {
        invoice_id: invoiceId,
        vat_number: vatNumber,
        authorized_company: null,
        user_id: null,
        user_name: userName ? String(userName).slice(0, 80) : null,
        accounting_software_number: accountingSoftwareNumber,
      },
    })
  }

  let callRes = await makeCall()
  if (!callRes.ok && callRes.kind === "unauthorized") {
    // 401 handling: refresh ONCE then retry ONCE
    const refreshed = await refreshShaamTokenManual({ companyId, ignoreCooldown: true })
    if (refreshed.ok) {
      callRes = await makeCall()
    }
  }

  if (!callRes.ok && callRes.kind === "unauthorized") {
    await markConnectionError({ companyId, status: "expired", errorCode: "unauthorized", errorMessage: "unauthorized" })
    return NextResponse.json(
      { ok: false, message: "shaam_reconnect_required", redirect_to: "/dashboard/settings/integrations/shaam" },
      { status: 403 }
    )
  }

  if (!callRes.ok) {
    await recordShaamEvent({
      companyId,
      eventType:
        decision === "CANCEL"
          ? "decision_cancel"
          : decision === "CONTINUE"
            ? "decision_continue"
            : "decision_further_objection",
      payload: { document_id: documentId, ok: false, kind: callRes.kind },
    })
    return NextResponse.json({ ok: false, message: "shaam_decision_failed" }, { status: 502 })
  }

  const nowIso = new Date().toISOString()

  await admin
    .from("documents")
    .update({
      invoice_decision_type: decision,
      invoice_decision_sent_at: nowIso,
      allocation_status: decision === "CONTINUE" ? "skipped_by_user" : "pending_decision",
    } as any)
    .eq("id", documentId)
    .eq("company_id", companyId)

  await recordShaamEvent({
    companyId,
    eventType:
      decision === "CANCEL"
        ? "decision_cancel"
        : decision === "CONTINUE"
          ? "decision_continue"
          : "decision_further_objection",
    payload: { document_id: documentId, ok: true },
  })

  if (decision === "CANCEL") {
    // Use existing cancellation mechanism (do not refactor).
    const r = await markDocumentCancelledAction({ documentId, reason: "shaam_decision_cancel" })
    if (!r.ok) {
      return NextResponse.json({ ok: false, message: r.message || "cancel_failed" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, decision, cancelled: true })
  }

  if (decision === "FURTHEROBJECTION") {
    // Safer default: do not allow final issuance after further objection.
    return NextResponse.json({ ok: true, decision, allocation_status: "pending_decision", blockFinalization: true })
  }

  // CONTINUE: allow issuance without allocation_number.
  return NextResponse.json({ ok: true, decision, allocation_status: "skipped_by_user" })
}

