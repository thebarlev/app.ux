/**
 * Unified document workflow helpers
 * Provides consistent patterns for multi-tenant document management
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"
import { isDigitalSignaturesEnabled } from "@/lib/documents/signing/feature-flags"
import { createSigningRequest, sha256Hex as sha256HexFromSigningClient } from "./documents/signing/secure-signature-client"
import { stampPdfFooter } from "@/lib/pdf/stamp-footer"
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { callShaamInvoiceApprovalV2, type ShaamApprovalV2Payload } from "@/lib/shaam/invoice-allocation"
import { markConnectionError, recordShaamEvent } from "@/lib/shaam/tokens"
import { getValidShaamAccessToken, NeedsReauthError, ShaamTransientError } from "@/lib/shaam/token-manager"
import { DocIssueTracker } from "@/lib/diagnostics/external-services-check"

const toSequenceDocumentType = (documentType: string) => {
  if (documentType === "invoiceReceipt") return "invoice_receipt"
  if (documentType === "creditNote") return "credit_note"
  if (documentType === "workOrder") return "work_order"
  if (documentType === "deliveryNote") return "delivery_note"
  if (documentType === "returnNote") return "return_note"
  if (documentType === "purchaseOrder") return "purchase_order"
  if (documentType === "selfInvoice") return "self_invoice"
  if (documentType === "selfCreditNote") return "self_credit_note"
  return documentType
}

export async function getCompanyIdForUser(): Promise<string> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error("[getCompanyIdForUser] ❌ No authenticated user");
    throw new Error("not_authenticated");
  }

  const companyIds = new Set<string>()

  // Companies from company_members
  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)

  if (membershipError) {
    console.error("[getCompanyIdForUser] company_members error:", membershipError)
  }
  for (const m of memberships || []) {
    if (m?.company_id) companyIds.add(m.company_id)
  }

  // Companies from auth_user_id (owner)
  const { data: ownedCompanies, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", user.id)

  if (companyError) {
    console.error("[getCompanyIdForUser] companies error:", companyError)
  }
  for (const c of ownedCompanies || []) {
    if (c?.id) companyIds.add(c.id)
  }

  if (companyIds.size === 0) {
    console.error("[getCompanyIdForUser] ❌ No company found for user:", user.id);
    throw new Error("company_not_found")
  }

  return Array.from(companyIds)[0]
}

export async function initializeSequence(
  companyId: string,
  documentType: string,
  startingNumber: number,
  prefix?: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const sequenceDocumentType = toSequenceDocumentType(documentType)

  const { data: existing } = await supabase
    .from("document_sequences")
    .select("id, is_locked")
    .eq("company_id", companyId)
    .eq("document_type", sequenceDocumentType)
    .maybeSingle()

  if (existing) {
    if (existing.is_locked) {
      return { ok: false, message: "sequence_already_locked" }
    }
    const { error } = await supabase
      .from("document_sequences")
      .update({
        starting_number: startingNumber,
        current_number: startingNumber - 1,
        prefix: prefix ?? "",
        is_locked: true,
        locked_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  const { error } = await supabase
    .from("document_sequences")
    .insert({
      company_id: companyId,
      document_type: sequenceDocumentType,
      starting_number: startingNumber,
      current_number: startingNumber - 1,
      prefix: prefix ?? "",
      is_locked: true,
      locked_at: new Date().toISOString(),
    })

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

export async function isSequenceLocked(params: {
  companyId: string;
  documentType: string;
}): Promise<{ locked: boolean; currentNumber: number | null }> {
  const supabase = await createClient()
  const sequenceDocumentType = toSequenceDocumentType(params.documentType)

  console.log("[isSequenceLocked] Called with params:", params);

  if (!params.companyId || params.companyId === "undefined") {
    console.error("[isSequenceLocked] ❌ Invalid companyId:", params.companyId);
    return { locked: false, currentNumber: null };
  }

  const { data, error } = await supabase
    .from("document_sequences")
    .select("is_locked, current_number, starting_number, prefix")
    .eq("company_id", params.companyId)
    .eq("document_type", sequenceDocumentType)
    .maybeSingle()

  if (error) {
    console.error("[isSequenceLocked] ❌ Error checking sequence:", error)
    return { locked: false, currentNumber: null }
  }

  if (!data) {
    console.log("[isSequenceLocked] No sequence found, returning unlocked");
    return { locked: false, currentNumber: null }
  }

  console.log("[isSequenceLocked] ✅ Result:", { locked: !!data.is_locked, currentNumber: data.current_number });

  return {
    locked: !!data.is_locked,
    currentNumber: typeof data.current_number === "number" ? data.current_number : null,
  }
}

export async function getNextDocumentNumberPreview(
  companyId: string,
  documentType: string
): Promise<{ nextNumber: number | null; formatted: string | null }> {
  const supabase = await createClient()
  const sequenceDocumentType = toSequenceDocumentType(documentType)

  const { data: sequence } = await supabase
    .from("document_sequences")
    .select("current_number, starting_number, prefix, is_locked")
    .eq("company_id", companyId)
    .eq("document_type", sequenceDocumentType)
    .maybeSingle()

  if (!sequence) {
    return { nextNumber: null, formatted: null }
  }

  const nextNum = Math.max(sequence.current_number + 1, sequence.starting_number)
  const prefix = sequence.prefix || ""
  const formatted = `${prefix}${nextNum}`

  return { nextNumber: nextNum, formatted }
}

export async function finalizeDocument(
  draftId: string,
  companyId: string,
  documentType: string,
  opts?: { createdByName?: string | null; createdByEmail?: string | null; attemptId?: string }
): Promise<{
  ok: boolean
  documentNumber?: string
  message?: string
  reason?: string | null
  shaam?: { kind: "decision_required"; error_id: string } | { kind: "reconnect_required"; redirect_to: string } | null
  signing?: {
    pdf_hashes: {
      original_he_sha256: string
      copy_he_sha256: string
      copy_en_sha256?: string | null
    }
    signing_request_ids: {
      original_he: string | null
      copy_he: string | null
      copy_en?: string | null
    }
    signed_pdf_base64: {
      original_he: string
      copy_he: string
      copy_en?: string | null
    }
  }
}> {
  const agentFinalizeStart = Date.now()

  // Reuse caller's attempt_id when threaded through opts; otherwise create
  // a local tracker. This keeps `[DOC_ISSUE]` lines correlatable with the
  // route-level handler's chain when present.
  const tracker = new DocIssueTracker(opts?.attemptId)
  tracker.step("finalize_entry", {
    draft_id: draftId,
    document_type: documentType,
    company_id8: String(companyId || "").slice(0, 8),
  })

  const requestId = randomUUID()
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const sequenceDocumentType = toSequenceDocumentType(documentType)

  // ====================================================
  // Osek patur guard.
  // An osek patur may not issue a tax invoice and may not charge VAT.
  // Checked before the document number is reserved, so a rejected document
  // never consumes a number and leaves a gap in the sequence.
  // ====================================================
  {
    const [{ data: guardCompany, error: guardCompanyErr }, { data: guardDoc, error: guardDocErr }] = await Promise.all([
      adminClient.from("companies").select("business_type").eq("id", companyId).maybeSingle(),
      adminClient.from("documents").select("vat_rate, vat_amount").eq("id", draftId).eq("company_id", companyId).maybeSingle(),
    ])

    // Fail-closed: never issue when we cannot establish the issuer's status.
    if (guardCompanyErr || guardDocErr || !guardCompany) {
      return {
        ok: false,
        message: "לא ניתן לאמת את סוג העסק. נסה שוב בעוד רגע.",
        reason: "business_type_load_failed",
      }
    }

    if (String((guardCompany as any).business_type || "") === "osek_patur") {
      const supervised = sequenceDocumentType === "tax_invoice" || sequenceDocumentType === "invoice_receipt"
      if (supervised) {
        return {
          ok: false,
          message: "עוסק פטור אינו רשאי להנפיק חשבונית מס. יש להנפיק חשבונית עסקה או קבלה.",
          reason: "osek_patur_cannot_issue_tax_invoice",
        }
      }

      const vatRate = Number((guardDoc as any)?.vat_rate ?? 0)
      const vatAmount = Number((guardDoc as any)?.vat_amount ?? 0)
      if ((Number.isFinite(vatRate) && vatRate > 0) || (Number.isFinite(vatAmount) && vatAmount > 0)) {
        return {
          ok: false,
          message: "עוסק פטור אינו רשאי לגבות מע״מ. יש לאפס את שיעור המע״מ במסמך.",
          reason: "osek_patur_cannot_charge_vat",
        }
      }
    }
  }

  const { data: existingDoc, error: existingError } = await supabase
    .from("documents")
    .select("document_number")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (existingError) {
    tracker.fail("sequence_resolved", existingError, { draft_id: draftId })
    return { ok: false, message: existingError.message }
  }

  let docNumber = existingDoc?.document_number ?? null
  const reusedExistingNumber = !!existingDoc?.document_number

  if (!docNumber) {
    const { data: generatedNumber, error: rpcError } = await supabase.rpc(
      "generate_document_number",
      {
        p_company_id: companyId,
        p_document_type: sequenceDocumentType,
      }
    )

    if (rpcError) {
      tracker.fail("sequence_resolved", rpcError, { draft_id: draftId })
      return { ok: false, message: rpcError.message }
    }

    docNumber = generatedNumber

    tracker.step("sequence_resolved", {
      draft_id: draftId,
      reused_existing: false,
      doc_number_length: docNumber ? String(docNumber).length : 0,
    })

    console.log(`[finalizeDocument] Updating document ${draftId} with document_number: ${docNumber} (before PDF generation)...`)

    const { error: updateNumberError } = await supabase
      .from("documents")
      .update({
        document_number: docNumber,
      })
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("document_status", "draft")

    if (updateNumberError) {
      tracker.fail("update_document_number_failed", updateNumberError, { draft_id: draftId })
      console.error(`[finalizeDocument] Failed to update document_number for document ${draftId}:`, updateNumberError)
      return { ok: false, message: `Failed to update document number: ${updateNumberError.message}` }
    }

    tracker.step("update_document_number_ok", { draft_id: draftId })
    console.log(`✅ [finalizeDocument] Document ${draftId} updated with document_number: ${docNumber}`)
  } else {
    tracker.step("sequence_resolved", {
      draft_id: draftId,
      reused_existing: true,
      doc_number_length: docNumber ? String(docNumber).length : 0,
    })
  }

  // ====================================================
  // Phase 2 (SHAAM): allocation number for high-value invoices (sandbox only)
  // Applies ONLY to: tax_invoice, invoice_receipt (invoiceReceipt)
  // Business rule precision:
  // - Apply only from invoice_date >= 2026-01-01
  // - Require when subtotal (before VAT) > global threshold (invoice_allocation_threshold_ils); exactly the threshold is exempt
  // - Exempt issuer business_type == 'osek_patur'
  // ====================================================
  if (documentType === "tax_invoice" || documentType === "invoiceReceipt") {
    const redirectTo = "/dashboard/settings/integrations/shaam"
    const nowIso = new Date().toISOString()

    const reqEnvInt = (name: string): number => {
      const raw = String(process.env[name] || "").trim()
      const n = Number(raw)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`Missing or invalid ${name}`)
      }
      return n
    }

    const reqEnvString = (name: string): string => {
      const v = String(process.env[name] || "").trim()
      if (!v) throw new Error(`Missing or invalid ${name}`)
      return v
    }

    // Load issuer + document + customer tax ids needed for SHAAM payload
    const [{ data: companyRow, error: companyErr }, { data: docRow, error: docErr }, { data: thresholdRow }] = await Promise.all([
      adminClient
        .from("companies")
        .select("business_type, tax_id, registration_number, company_number")
        .eq("id", companyId)
        .maybeSingle(),
      adminClient
        .from("documents")
        .select(
          "id, document_type, issue_date, document_number, subtotal, vat_rate, vat_amount, total_amount, customer_id, customer_name, customer_tax_id, document_description, internal_notes, requires_allocation_number, allocation_status, allocation_number, shaam_error_id, invoice_decision_type"
        )
        .eq("id", draftId)
        .eq("company_id", companyId)
        .maybeSingle(),
      adminClient
        .from("global_settings")
        .select("setting_value")
        .eq("setting_key", "invoice_allocation_threshold_ils")
        .maybeSingle(),
    ])

    // Fail-closed: for supervised document types we cannot silently skip the
    // allocation block when the issuer/document lookup fails — that would issue
    // a regulated invoice with no allocation attempt at all.
    if (companyErr || docErr || !companyRow || !docRow) {
      await recordShaamEvent({
        companyId,
        eventType: "allocation_failed",
        payload: {
          document_id: draftId,
          reason: "context_load_failed",
          company_error: Boolean(companyErr),
          document_error: Boolean(docErr),
        },
      })
      return {
        ok: false,
        message: "לא ניתן לאמת את נתוני העסק/המסמך מול רשות המסים. נסה שוב בעוד רגע.",
        reason: "shaam_allocation_context_load_failed",
      }
    }

    {
      const dbDocType = String((docRow as any).document_type || "")
      const isInvoiceLike = dbDocType === "tax_invoice" || dbDocType === "invoice_receipt"

      const issueDateYmd = (docRow as any).issue_date ? String((docRow as any).issue_date).slice(0, 10) : ""
      const isInEffect = issueDateYmd >= "2026-01-01"

      const businessType = typeof (companyRow as any).business_type === "string" ? String((companyRow as any).business_type) : ""
      const isExemptOsekPatur = businessType === "osek_patur"

      // Fail-safe default: fall back to the stricter (lower) statutory threshold
      // so a missing/corrupt setting never lets an invoice through unallocated.
      const thresholdRaw = thresholdRow?.setting_value ? String(thresholdRow.setting_value) : "5000"
      const thresholdIls = Number(thresholdRaw)
      const thresholdSafe = Number.isFinite(thresholdIls) && thresholdIls > 0 ? thresholdIls : 5000

      const subtotalRaw = (docRow as any).subtotal
      const vatAmountRaw = (docRow as any).vat_amount
      const totalRaw = (docRow as any).total_amount
      const subtotal =
        typeof subtotalRaw === "number"
          ? subtotalRaw
          : subtotalRaw !== null && subtotalRaw !== undefined
            ? Number(subtotalRaw)
            : NaN
      const vatAmount =
        typeof vatAmountRaw === "number"
          ? vatAmountRaw
          : vatAmountRaw !== null && vatAmountRaw !== undefined
            ? Number(vatAmountRaw)
            : 0
      const totalAmount =
        typeof totalRaw === "number" ? totalRaw : totalRaw !== null && totalRaw !== undefined ? Number(totalRaw) : 0

      const paymentAmountBeforeVat = Number.isFinite(subtotal) ? subtotal : totalAmount - (Number.isFinite(vatAmount) ? vatAmount : 0)
      const paymentAmountSafe = Number.isFinite(paymentAmountBeforeVat) ? Number(paymentAmountBeforeVat.toFixed(2)) : 0
      const vatAmountSafe = Number.isFinite(vatAmount) ? Number(vatAmount.toFixed(2)) : 0

      // ITA requires an allocation number only ABOVE the threshold (₪5,001+).
      // An invoice of exactly ₪5,000 must issue with no allocation and no customer
      // ID — hence strictly greater-than, not >=.
      const requiresAllocation =
        isInvoiceLike && isInEffect && !isExemptOsekPatur && paymentAmountSafe > thresholdSafe

      // Persist informational flags early (best-effort; never block issuance on this update).
      try {
        await adminClient
          .from("documents")
          .update({
            requires_allocation_number: requiresAllocation,
            allocation_status: requiresAllocation ? String((docRow as any).allocation_status || "pending") : "not_required",
          } as any)
          .eq("id", draftId)
          .eq("company_id", companyId)
      } catch {
        // ignore
      }

      if (requiresAllocation) {
        const currentStatus = String((docRow as any).allocation_status || "pending")
        const existingAllocationNumber = (docRow as any).allocation_number ? String((docRow as any).allocation_number) : null
        const existingErrorId = (docRow as any).shaam_error_id ? String((docRow as any).shaam_error_id) : null
        const existingDecision = (docRow as any).invoice_decision_type ? String((docRow as any).invoice_decision_type) : null

        // If user previously chose CONTINUE, we allow finalization without allocation number.
        if (existingDecision === "CONTINUE" || currentStatus === "skipped_by_user") {
          // proceed
        } else if (existingAllocationNumber && currentStatus === "received") {
          // proceed (idempotent)
        } else if (currentStatus === "pending_decision" && existingErrorId) {
          return {
            ok: false,
            message: "shaam_decision_required",
            reason: "shaam_decision_required",
            shaam: { kind: "decision_required", error_id: existingErrorId },
          }
        } else {
          // Build VAT numbers (digits-only) and validate.
          const issuerTaxIdRaw =
            (companyRow as any).tax_id || (companyRow as any).registration_number || (companyRow as any).company_number || ""
          const issuerVatDigits = String(issuerTaxIdRaw || "").replace(/\D/g, "")
          const issuerVat = issuerVatDigits ? Number(issuerVatDigits) : NaN

          const customerTaxIdRaw = (docRow as any).customer_tax_id || null
          let customerVatDigits = customerTaxIdRaw ? String(customerTaxIdRaw).replace(/\D/g, "") : ""
          const customerId = (docRow as any).customer_id ? String((docRow as any).customer_id) : null
          const { data: customerRow } = customerId
            ? await adminClient
                .from("customers")
                .select("tax_id, name, address_country")
                .eq("id", customerId)
                .eq("company_id", companyId)
                .maybeSingle()
            : { data: null as any }

          if (!customerVatDigits && customerRow?.tax_id) {
            customerVatDigits = String(customerRow.tax_id).replace(/\D/g, "")
          }
          const customerVat = customerVatDigits ? Number(customerVatDigits) : NaN

          const invoiceReference = String(docNumber || "").trim()
          const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceReference)
          if (!invoiceReference || looksLikeUuid || invoiceReference.length > 20) {
            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, reason: "invalid_invoice_reference_number" },
            })
            return { ok: false, message: "מספר מסמך לא תקין להקצאה. נסה שוב.", reason: "shaam_allocation_invalid_reference" }
          }

          // Both identities are MANDATORY for the allocation path. The issuer
          // (vat_number + user_id) is sourced dynamically from the connected company.
          //
          // customer_vat_number is REQUIRED by ITA's live v2/Approval schema: it must
          // be present, a number, >= 10 — verified against the sandbox (omitting it,
          // null, and 0 all return 422 [JSV0002/JSV0001/JSV0008]). It may be the
          // customer's ח.פ (business) or ת.ז (individual). This applies ONLY on the
          // allocation path (>= statutory threshold); invoices below it never reach
          // this call and are unaffected.
          const issuerVatMissing = !Number.isInteger(issuerVat) || issuerVat <= 0
          const customerVatMissing = !Number.isInteger(customerVat) || customerVat <= 0

          if (issuerVatMissing || customerVatMissing) {
            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: {
                document_id: draftId,
                reason: "missing_vat_numbers",
                // Which side is missing — different fixes.
                issuer_vat_missing: issuerVatMissing,
                customer_vat_missing: customerVatMissing,
              },
            })

            const message = issuerVatMissing
              ? "חסר מספר עוסק/ח.פ של העסק שלך. עדכן אותו בהגדרות › פרטי העסק ונסה שוב."
              : 'חסר מספר עוסק/ח.פ של הלקוח. מלא את השדה "מספר עוסק / ח.פ של הלקוח" בטופס החשבונית ונסה שוב.'

            return { ok: false, message, reason: "shaam_allocation_missing_vat" }
          }

          // Build full Approval v2 payload (spec-compliant, snake_case, no undefined).
          const toFiniteNumber = (v: any, fallback = 0): number => {
            const n = typeof v === "number" ? v : v !== null && v !== undefined ? Number(v) : NaN
            return Number.isFinite(n) ? n : fallback
          }

          const toStrOrEmpty = (v: any): string => (v === null || v === undefined ? "" : String(v))

          const accountingSoftwareNumber = reqEnvInt("SHAAM_ACCOUNTING_SOFTWARE_NUMBER")
          // Optional per ITA. Undefined when unset, so omitNullish drops the key
          // from the wire rather than sending "" or null (both rejected).
          const clientSoftwareKeyRaw = String(process.env.SHAAM_CLIENT_SOFTWARE_KEY || "").trim()
          const clientSoftwareKey = clientSoftwareKeyRaw ? clientSoftwareKeyRaw : undefined

          const invoiceTypeTaxInvoice = reqEnvInt("SHAAM_APPROVAL_INVOICE_TYPE_TAX_INVOICE")
          const invoiceTypeInvoiceReceipt = reqEnvInt("SHAAM_APPROVAL_INVOICE_TYPE_INVOICE_RECEIPT")
          const invoiceType = dbDocType === "tax_invoice" ? invoiceTypeTaxInvoice : invoiceTypeInvoiceReceipt

          const branchId = String(process.env.SHAAM_APPROVAL_BRANCH_ID || "0").trim() || "0"
          // action: ITA enum. 0 = standard tax invoice. Verified against the
          // sandbox: 1 and 2 are rejected with 422 [JSV0013] (not in the enum).
          const action = (() => {
            const raw = String(process.env.SHAAM_APPROVAL_ACTION || "0").trim()
            const n = Number(raw)
            return Number.isFinite(n) && Number.isInteger(n) ? n : 0
          })()

          // item category: ITA requires 1-4 ("Category must start with 1, 2, 3,
          // or 4", error 450). 2 = service, which is what we invoice.
          const defaultCategory = (() => {
            const raw = String(process.env.SHAAM_APPROVAL_DEFAULT_ITEM_CATEGORY || "2").trim()
            const n = Number(raw)
            return Number.isFinite(n) && Number.isInteger(n) ? n : 2
          })()
          const measureUnitDescription = String(process.env.SHAAM_APPROVAL_DEFAULT_MEASURE_UNIT_DESCRIPTION || "יחידה").trim() || "יחידה"

          const userName =
            (opts?.createdByName && String(opts.createdByName).trim()) ||
            (opts?.createdByEmail && String(opts.createdByEmail).trim()) ||
            "system"
          // ITA spec: the invoice requires the issuing user's identity — at least
          // one of user_id (ת.ז) or user_name. We send BOTH: user_id sourced from
          // the issuing company's registration_number (the ת.ז), user_name below.
          // Verified against the sandbox: HTTP 200 + confirmation_number with
          // user_id populated from registration_number and authorized_company omitted.
          // An explicit SHAAM_APPROVAL_USER_ID env overrides if ever set. As a last
          // resort we send null (never throw) — user_name still satisfies the spec.
          const userId = (() => {
            const regDigits = String((companyRow as any).registration_number || "").replace(/\D/g, "")
            const regNum = regDigits ? Number(regDigits) : NaN
            if (Number.isInteger(regNum) && regNum > 0) return regNum
            const envRaw = String(process.env.SHAAM_APPROVAL_USER_ID || "").trim()
            const envNum = envRaw ? Number(envRaw) : NaN
            if (Number.isInteger(envNum) && envNum > 0) return envNum
            return null
          })()

          // ITA spec: authorized_company identifies a third-party proxy (מיופה כוח)
          // issuing on someone else's behalf. For self-issuance it must be null —
          // NOT the issuer's own VAT. omitNullish drops it from the wire. Only an
          // explicit SHAAM_APPROVAL_AUTHORIZED_COMPANY (true proxy setups) sets it.
          const authorizedCompany = (() => {
            const raw = String(process.env.SHAAM_APPROVAL_AUTHORIZED_COMPANY || "").trim()
            const n = raw ? Number(raw) : NaN
            if (Number.isInteger(n) && n > 0) return n
            return null
          })()

          const customerName =
            (docRow as any).customer_name ? String((docRow as any).customer_name).trim() :
            customerRow?.name ? String(customerRow.name).trim() :
            ""
          // ITA requires an ISO country code (max 3 chars). The customer record's
          // address_country is free text and may be a full name ("ישראל" → 5 chars,
          // which the gateway rejects with 422 [JSV0006]). Map to ISO: pass valid
          // 2–3 letter codes through, Israel names → IL, and for any other non-empty
          // value default to IL but LOG it — never silently mislabel a foreign
          // customer as Israeli.
          const customerCountryCode = (() => {
            const raw = customerRow?.address_country ? String(customerRow.address_country).trim() : ""
            if (!raw) return "IL"
            if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase()
            if (/^(ישראל|israel)$/i.test(raw)) return "IL"
            console.warn("[shaam][allocation] customer_country_code fell back to IL for non-ISO value", {
              document_id: draftId,
              raw_value: raw,
            })
            return "IL"
          })()

          const vatRate = toFiniteNumber((docRow as any).vat_rate, 0)

          const { data: lineRows, error: lineErr } = await adminClient
            .from("document_line_items")
            .select("line_number, description, quantity, unit_price, discount_amount, line_total, item_code, item_sku")
            .eq("document_id", draftId)
            .eq("company_id", companyId)
            .order("line_number", { ascending: true })

          if (lineErr) {
            return { ok: false, message: "בעיה זמנית בהכנת שורות למסמך. נסה שוב בעוד רגע.", reason: "shaam_allocation_line_items_failed" }
          }
          const lineItems = Array.isArray(lineRows) ? lineRows : []
          if (lineItems.length === 0) {
            return { ok: false, message: "חובה להוסיף לפחות שורה אחת למסמך כדי לקבל מספר הקצאה.", reason: "shaam_allocation_items_empty" }
          }

          const items: ShaamApprovalV2Payload["items"] = lineItems.map((row: any) => {
            const index = Number.isInteger(row?.line_number) ? Number(row.line_number) : Number(row?.line_number || 0)
            const quantity = toFiniteNumber(row?.quantity, 0)
            const price_per_unit = toFiniteNumber(row?.unit_price, 0)
            const discount = toFiniteNumber(row?.discount_amount, 0)
            const total_amount = toFiniteNumber(row?.line_total, 0)
            const vat_amount = Number.isFinite(vatRate) ? Number((total_amount * (vatRate / 100)).toFixed(2)) : 0
            const catalog_id =
              (row?.item_code && String(row.item_code).trim()) ||
              (row?.item_sku && String(row.item_sku).trim()) ||
              String(index || 0)
            return {
              index,
              catalog_id,
              category: defaultCategory,
              description: String(row?.description || "").trim() || "-",
              measure_unit_description: measureUnitDescription,
              quantity,
              price_per_unit,
              discount,
              total_amount,
              vat_rate: vatRate,
              vat_amount,
            }
          })

          const grossBeforeDiscount = lineItems.reduce((sum: number, row: any) => {
            const q = toFiniteNumber(row?.quantity, 0)
            const u = toFiniteNumber(row?.unit_price, 0)
            return sum + q * u
          }, 0)
          const discountTotal = lineItems.reduce((sum: number, row: any) => sum + toFiniteNumber(row?.discount_amount, 0), 0)

          const invoiceNote =
            (docRow as any).internal_notes ? String((docRow as any).internal_notes) :
            (docRow as any).document_description ? String((docRow as any).document_description) :
            ""

          const approvalPayload: ShaamApprovalV2Payload = {
            invoice_id: toStrOrEmpty((docRow as any).id).trim() || String(draftId),
            invoice_type: invoiceType,
            vat_number: issuerVat,
            union_vat_number: null,
            authorized_company: authorizedCompany,
            user_id: userId,
            user_name: String(userName).slice(0, 80),
            invoice_reference_number: invoiceReference,
            // Required by ITA (present, number, >= 10); guaranteed valid past the
            // guard above. Customer's ח.פ or ת.ז.
            customer_vat_number: customerVat,
            customer_name: customerName,
            customer_country_code: customerCountryCode || "IL",
            invoice_date: issueDateYmd,
            invoice_issuance_date: issueDateYmd,
            branch_id: branchId,
            accounting_software_number: accountingSoftwareNumber,
            client_software_key: clientSoftwareKey,
            amount_before_discount: Number(grossBeforeDiscount.toFixed(2)),
            discount: Number(discountTotal.toFixed(2)),
            payment_amount: paymentAmountSafe,
            vat_amount: vatAmountSafe,
            payment_amount_including_vat: Number((paymentAmountSafe + vatAmountSafe).toFixed(2)),
            invoice_note: String(invoiceNote || ""),
            action,
            vehicle_license_number: null,
            phone_of_driver: null,
            arrival_date: null,
            estimated_arrival_time: null,
            transition_location: null,
            delivery_address: null,
            additional_information: null,
            additional_information_1: null,
            additional_information_2: null,
            additional_information_3: null,
            items,
          }

          // Non-secret audit: log the identity fields actually sent to ITA (invoice
          // party identifiers, not secrets) so a request can be verified from logs.
          console.log("[shaam][allocation] payload_identity", {
            document_id: draftId,
            invoice_reference_number: invoiceReference,
            invoice_type: invoiceType,
            vat_number: issuerVat,
            user_id: userId,
            authorized_company: authorizedCompany,
            customer_vat_number: customerVat,
            customer_country_code: customerCountryCode || "IL",
            items_count: items.length,
          })

          // Ensure we have a valid token (server-only); refreshes if needed.
          let accessToken: string
          try {
            accessToken = await getValidShaamAccessToken(companyId)
          } catch (e: any) {
            if (e instanceof NeedsReauthError) {
              return {
                ok: false,
                message: "יש להתחבר לרשות המסים כדי להפיק מסמך זה.",
                reason: "shaam_reconnect_required",
                shaam: { kind: "reconnect_required", redirect_to: redirectTo },
              }
            }
            if (e instanceof ShaamTransientError) {
              return { ok: false, message: "בעיה זמנית בחיבור לרשות המסים. נסה שוב בעוד רגע.", reason: "shaam_token_transient" }
            }
            return { ok: false, message: "בעיה זמנית בחיבור לרשות המסים. נסה שוב בעוד רגע.", reason: "shaam_token_transient" }
          }

          // Mark as pending + audit request (token-free)
          await adminClient
            .from("documents")
            .update({
              requires_allocation_number: true,
              allocation_status: "pending",
              allocation_requested_at: nowIso,
              allocation_provider_response: null,
            } as any)
            .eq("id", draftId)
            .eq("company_id", companyId)

          await recordShaamEvent({
            companyId,
            eventType: "allocation_request",
            payload: { document_id: draftId, document_type: dbDocType, payment_amount: paymentAmountSafe, vat_amount: vatAmountSafe, issue_date: issueDateYmd },
          })

          const makeCall = async (token: string) => {
            return await callShaamInvoiceApprovalV2({
              accessToken: token,
              payload: approvalPayload,
            })
          }

          let callRes: Awaited<ReturnType<typeof makeCall>>
          try {
            callRes = await makeCall(accessToken)
          } catch (e: any) {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "failed",
                allocation_requested_at: nowIso,
                allocation_provider_response: { error: "payload_validation_failed", message: String(e?.message || e).slice(0, 500) },
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)
            return { ok: false, message: "נתונים לא תקינים לבקשת הקצאה. בדוק את פרטי המסמך ונסה שוב.", reason: "shaam_allocation_payload_invalid" }
          }
          if (!callRes.ok && callRes.kind === "unauthorized") {
            // 401 handling: refresh ONCE then retry ONCE
            try {
              const refreshedToken = await getValidShaamAccessToken(companyId, { forceRefresh: true })
              callRes = await makeCall(refreshedToken)
            } catch {
              // fall through
            }
          }

          if (callRes.ok && callRes.kind === "approved") {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "received",
                allocation_number: callRes.confirmation_number,
                allocation_requested_at: nowIso,
                allocation_provider_response: callRes.provider_json,
                shaam_error_id: null,
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)

            await recordShaamEvent({
              companyId,
              eventType: "allocation_received",
              payload: { document_id: draftId, confirmation_number: callRes.confirmation_number },
            })
          } else if (callRes.ok && callRes.kind === "rejected") {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "failed",
                allocation_requested_at: nowIso,
                allocation_provider_response: callRes.provider_json,
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)

            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, approved: false },
            })

            return { ok: false, message: "רשות המסים דחתה את בקשת ההקצאה. לא ניתן להמשיך.", reason: "shaam_allocation_rejected" }
          } else if (!callRes.ok && callRes.kind === "decision_required") {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "pending_decision",
                allocation_requested_at: nowIso,
                allocation_provider_response: callRes.provider_json,
                shaam_error_id: callRes.error_id,
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)

            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, http_status: 406, error_id: callRes.error_id },
            })

            return {
              ok: false,
              message: "shaam_decision_required",
              reason: "shaam_decision_required",
              shaam: { kind: "decision_required", error_id: callRes.error_id },
            }
          } else if (!callRes.ok && callRes.kind === "unauthorized") {
            await markConnectionError({
              companyId,
              status: "expired",
              errorCode: "unauthorized",
              errorMessage: "unauthorized",
            })
            return {
              ok: false,
              message: "תוקף החיבור לרשות המסים פג. התחבר מחדש כדי להמשיך.",
              reason: "shaam_reconnect_required",
              shaam: { kind: "reconnect_required", redirect_to: redirectTo },
            }
          } else if (!callRes.ok && callRes.kind === "bad_request") {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "failed",
                allocation_requested_at: nowIso,
                allocation_provider_response: callRes.provider_json,
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)

            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, http_status: 400 },
            })

            return { ok: false, message: "נתונים לא תקינים. בדוק את פרטי הלקוח ונסה שוב.", reason: "shaam_allocation_bad_request" }
          } else if (!callRes.ok) {
            await adminClient
              .from("documents")
              .update({
                requires_allocation_number: true,
                allocation_status: "failed",
                allocation_requested_at: nowIso,
                allocation_provider_response: (callRes as any).provider_json ?? null,
              } as any)
              .eq("id", draftId)
              .eq("company_id", companyId)

            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, http_status: 500 },
            })

            return { ok: false, message: "בעיה זמנית בהקצאת מספר. נסה שוב בעוד רגע.", reason: "shaam_allocation_temporary" }
          }
        }
      }
    }
  }

  console.log(`[finalizeDocument] Generating deterministic PDF + signing for document ${draftId}...`)

  if (!isDigitalSignaturesEnabled()) {
    return {
      ok: false,
      message:
        "Digital signing is required for issuing accounting documents. Enable DIGITAL_SIGNATURES_ENABLED=true and configure Secure Signature env vars.",
    }
  }

  // Fetch company data for signing
  const { data: companyData } = await adminClient
    .from("companies")
    .select("company_name, tax_id, registration_number, company_number, email, contact_full_name")
    .eq("id", companyId)
    .single();

  // Determine the business tax ID from available fields
  const businessTaxId = companyData?.tax_id || companyData?.registration_number || companyData?.company_number || null;
  const businessContactName = companyData?.contact_full_name || null;

  // Get current user for event logging
  const { data: { user } } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString()

  const { error: freezeTimeError } = await adminClient
    .from("documents")
    .update({ pdf_generated_at: nowIso })
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_status", "draft")
    .is("pdf_generated_at", null)

  if (freezeTimeError) {
    return { ok: false, message: `Failed to freeze pdf_generated_at: ${freezeTimeError.message}` }
  }

  const { data: langRow, error: langError } = await adminClient
    .from("documents")
    .select("language, document_type, document_number, issue_date, template_version_id")
    .eq("id", draftId)
    .single()
  if (langError || !langRow) {
    return { ok: false, message: `Failed to resolve document language/type: ${langError?.message || "unknown"}` }
  }

  const documentLanguage: "he" | "en" = ((langRow as any)?.language as any) === "en" ? "en" : "he"
  const dbDocumentType: string = String((langRow as any)?.document_type || documentType)
  const docNumberFromDb: string | null = (langRow as any)?.document_number ? String((langRow as any).document_number) : null
  const issueDate: string | null = (langRow as any)?.issue_date ? String((langRow as any).issue_date) : null

  if (!docNumber && docNumberFromDb) {
    docNumber = docNumberFromDb
  }

  const { renderDeterministicPdfBytes } = await import("@/lib/pdf-service")

  const signAndReturn = async (args: {
    language: "he" | "en"
    variant: "original" | "copy"
    label: string
    templateVersionId?: string | null
  }) => {
    tracker.step("pdf_render_call_start", {
      draft_id: draftId,
      variant: args.variant,
      language: args.language,
    })
    let rendered: Awaited<ReturnType<typeof renderDeterministicPdfBytes>>
    try {
      rendered = await renderDeterministicPdfBytes({
        documentId: draftId,
        language: args.language,
        documentCopyLabel: args.label,
        templateVersionId: args.templateVersionId,
        attemptId: tracker.attemptId,
      } as any)
    } catch (e: any) {
      tracker.fail("pdf_render_call_failed", e, {
        draft_id: draftId,
        variant: args.variant,
        language: args.language,
      })
      throw e
    }
    if (!rendered.ok) {
      tracker.fail("pdf_render_call_failed", new Error(rendered.message), {
        draft_id: draftId,
        variant: args.variant,
        language: args.language,
      })
      return { ok: false as const, message: rendered.message }
    }
    tracker.step("pdf_render_call_ok", {
      draft_id: draftId,
      variant: args.variant,
      language: args.language,
      pdf_bytes: rendered.pdfBytes.length,
      pdf_sha256_8: String(rendered.pdfSha256 || "").slice(0, 8),
    })

    const externalDocId = `${draftId}:${args.variant}:${args.language}`
    
    const metadataToSendBase = {
      document_id: draftId,
      document_number: docNumber,
      document_type: dbDocumentType,
      issue_date: issueDate,
      variant: args.variant,
      language: args.language,
      unsigned_pdf_sha256: rendered.pdfSha256,
      template_version_id: rendered.templateVersionId,
      pdf_generated_at: rendered.frozenNowIso,
      created_by: opts?.createdByName || businessContactName || null,
      creator_email: opts?.createdByEmail || companyData?.email || null,
      business_tax_id: businessTaxId,
      business_contact_name: businessContactName,
    }
    
    const attemptSign = async (pdfBytes: Buffer, unsignedSha: string, attemptLabel: "stamped" | "ascii" | "raw") => {
      return createSigningRequest({
      businessId: companyId,
      externalDocId,

      // ✅ תיקון שם העסק (לא name!)
      businessName:
        (companyData?.company_name && companyData.company_name.trim())
          ? companyData.company_name.trim()
          : companyId,

      businessTaxId: businessTaxId,
      businessContactName: businessContactName,
      businessEmail: companyData?.email || null,
      supplierName: "VOW System",

        metadata: { ...metadataToSendBase, unsigned_pdf_sha256: unsignedSha, sign_attempt_label: attemptLabel },

        pdfBytes,
        attemptId: tracker.attemptId,
    } as any)
    }

    tracker.step("signing_call_start", {
      draft_id: draftId,
      variant: args.variant,
      language: args.language,
      pdf_bytes: rendered.pdfBytes.length,
    })
    let signing: Awaited<ReturnType<typeof attemptSign>>
    try {
      signing = await attemptSign(rendered.pdfBytes, rendered.pdfSha256, "stamped")
    } catch (e: any) {
      tracker.fail("signing_call_failed", e, {
        draft_id: draftId,
        variant: args.variant,
        language: args.language,
        attempt_label: "stamped",
      })
      throw e
    }
    if (!signing.ok) {
      tracker.fail("signing_call_failed", new Error(signing.message || "signing_failed"), {
        draft_id: draftId,
        variant: args.variant,
        language: args.language,
        attempt_label: "stamped",
        sign_code: (signing as any).code ?? null,
        sign_status: (signing as any).status ?? null,
      })
      const msg = `Signing failed (${signing.code}): ${signing.message}`

      // If stamping produced a PDF DSIGN can't sign, retry once with the raw (pre-stamp) PDF bytes.
      const looksLikeSigningFailed =
        String(signing.message || "").includes("signing_failed") ||
        String(signing.message || "").includes("Signing failed") ||
        String(signing.code || "") === "http_error"

      if (looksLikeSigningFailed && (rendered as any).rawPdfBytes && (rendered as any).rawPdfSha256) {
        // Retry once with the stamped PDF before falling back to RAW.
        // This mitigates transient signing failures without losing the footer.
        try {
          const stampedRetry = await attemptSign(rendered.pdfBytes, rendered.pdfSha256, "stamped")
          if ((stampedRetry as any)?.ok) {
            tracker.step("signing_call_ok", {
              draft_id: draftId,
              variant: args.variant,
              language: args.language,
              attempt_label: "stamped_retry",
            })
            return {
              ok: true as const,
              unsignedSha256: rendered.pdfSha256,
              signedSha256: (stampedRetry as any).signedPdfSha256,
              templateVersionId: rendered.templateVersionId,
              certInfo: (stampedRetry as any).certInfo,
              hashes: (stampedRetry as any).hashes,
              events: (stampedRetry as any).events,
              requestId: (stampedRetry as any).requestId || null,
              signedPdfBytes: (stampedRetry as any).signedPdfBytes,
              signedPdfBase64: (stampedRetry as any).signedPdfBytes.toString("base64"),
            }
          }
        } catch {
          // ignore and proceed to other fallbacks
        }

        // Retry with an ASCII-only stamped footer so the final signed PDF still contains a footer.
        // (DSIGN sometimes rejects PDFs with embedded Hebrew fonts.)
        if (args.language === "en") {
          try {
            const rawBytes: Buffer = (rendered as any).rawPdfBytes
            const asciiStamped = await stampPdfFooter({
              pdfBytes: rawBytes,
              language: "en",
              generatedAtText: String((rendered as any).frozenNowIso || ""),
            })
            const asciiSha = sha256HexFromSigningClient(asciiStamped)
            const asciiTry = await attemptSign(asciiStamped, asciiSha, "ascii")
            if (asciiTry.ok) {
              tracker.step("signing_call_ok", {
                draft_id: draftId,
                variant: args.variant,
                language: args.language,
                attempt_label: "ascii",
              })
              return {
                ok: true as const,
                unsignedSha256: asciiSha,
                signedSha256: asciiTry.signedPdfSha256,
                templateVersionId: rendered.templateVersionId,
                certInfo: asciiTry.certInfo,
                hashes: asciiTry.hashes,
                events: asciiTry.events,
                requestId: asciiTry.requestId || null,
                signedPdfBytes: asciiTry.signedPdfBytes,
                signedPdfBase64: asciiTry.signedPdfBytes.toString("base64"),
              }
            }
          } catch {
            // ignore, proceed to raw fallback
          }
        }

        const retry = await attemptSign((rendered as any).rawPdfBytes, (rendered as any).rawPdfSha256, "raw")
        if (retry.ok) {
          tracker.step("signing_call_ok", {
            draft_id: draftId,
            variant: args.variant,
            language: args.language,
            attempt_label: "raw",
          })
          return {
            ok: true as const,
            unsignedSha256: (rendered as any).rawPdfSha256,
            signedSha256: retry.signedPdfSha256,
            templateVersionId: rendered.templateVersionId,
            certInfo: retry.certInfo,
            hashes: retry.hashes,
            events: retry.events,
            requestId: retry.requestId || null,
            signedPdfBytes: retry.signedPdfBytes,
            signedPdfBase64: retry.signedPdfBytes.toString("base64"),
          }
        }
      }

      // Local/dev resilience: do not block standard document issuance if DSIGN is unavailable.
      if (process.env.NODE_ENV !== "production") {
        return {
          ok: true as const,
          unsignedSha256: rendered.pdfSha256,
          signedSha256: rendered.pdfSha256,
          templateVersionId: rendered.templateVersionId,
          certInfo: null,
          hashes: null,
          events: null,
          requestId: null,
          signedPdfBytes: rendered.pdfBytes,
          signedPdfBase64: rendered.pdfBytes.toString("base64"),
          unsignedFallback: true as const,
        }
      }

      return { ok: false as const, message: msg }
    }

    tracker.step("signing_call_ok", {
      draft_id: draftId,
      variant: args.variant,
      language: args.language,
      attempt_label: "stamped",
      signed_pdf_bytes: signing.signedPdfBytes.length,
    })

    try {
      const eventDataToSave = {
        provider: "secure_signature",
        request_id: signing.requestId,
        variant: args.variant,
        language: args.language,
        unsigned_pdf_sha256: rendered.pdfSha256,
        signed_pdf_sha256: signing.signedPdfSha256,
        cert_info: signing.certInfo,
        hashes: signing.hashes,
        events: signing.events,
        created_by_name: opts?.createdByName || businessContactName || null,
        created_by_email: opts?.createdByEmail || companyData?.email || null,
        business_name: companyData?.company_name || null,
        business_tax_id: businessTaxId,
        business_contact_name: businessContactName,
      };
      
      await adminClient.from("document_events").insert({
        document_id: draftId,
        company_id: companyId,
        event_type: "signed",
        performed_by: user?.id || null,
        event_data: eventDataToSave,
      })
    } catch (e: any) {
      // ignore
    }

    return {
      ok: true as const,
      unsignedSha256: rendered.pdfSha256,
      signedSha256: signing.signedPdfSha256,
      templateVersionId: rendered.templateVersionId,
      certInfo: signing.certInfo,
      hashes: signing.hashes,
      events: signing.events,
      requestId: signing.requestId || null,
      signedPdfBytes: signing.signedPdfBytes,
      signedPdfBase64: signing.signedPdfBytes.toString("base64"),
    }
  }

  const templateVersionIdBase = (langRow as any)?.template_version_id || null

  const originalT0 = Date.now()
  const copyT0 = Date.now()

  // Start HE signings concurrently (original + copy). EN is done after HE
  // to reduce concurrent load on the signing service.
  const originalPromise = signAndReturn({
    language: "he",
    variant: "original",
    label: "מקור",
    templateVersionId: templateVersionIdBase,
  })
  const copyPromise = signAndReturn({
    language: "he",
    variant: "copy",
    label: "העתק נאמן למקור",
    templateVersionId: templateVersionIdBase,
  })
  const settled = await Promise.allSettled([originalPromise, copyPromise] as any)

  const originalSettled = settled[0] as PromiseSettledResult<any>
  const copySettled = settled[1] as PromiseSettledResult<any>
  const enSettled: PromiseSettledResult<any> | null = null

  const original =
    originalSettled.status === "fulfilled"
      ? originalSettled.value
      : ({ ok: false, message: originalSettled.reason?.message || String(originalSettled.reason) } as const)
  const copy =
    copySettled.status === "fulfilled"
      ? copySettled.value
      : ({ ok: false, message: copySettled.reason?.message || String(copySettled.reason) } as const)

  const looksLikeTransientSigningFailure = (msg: unknown) => {
    const s = typeof msg === "string" ? msg : ""
    return s.includes("signing_failed") || s.includes("Signing failed (http_error)")
  }

  let originalFinal = original as any
  let copyFinal = copy as any

  // Retry once sequentially if DSIGN flaked during concurrent signing.
  if (!originalFinal.ok && looksLikeTransientSigningFailure(originalFinal.message)) {
    originalFinal = await signAndReturn({
      language: "he",
      variant: "original",
      label: "מקור",
      templateVersionId: templateVersionIdBase,
    })
  }
  if (!copyFinal.ok && looksLikeTransientSigningFailure(copyFinal.message)) {
    copyFinal = await signAndReturn({
      language: "he",
      variant: "copy",
      label: "העתק נאמן למקור",
      templateVersionId: templateVersionIdBase,
    })
  }

  if (!originalFinal.ok) return { ok: false, message: originalFinal.message }
  if (!copyFinal.ok) return { ok: false, message: copyFinal.message }

  let enSignedBase64: string | null = null
  let enSignedSha256: string | null = null
  let enRequestId: string | null = null
  let enSignedBytes: Buffer | null = null
  if (documentLanguage === "en") {
    const en = await signAndReturn({
      language: "en",
      variant: "copy",
      label: "Certified Copy",
      templateVersionId: templateVersionIdBase,
    })
    if (!en.ok) return { ok: false, message: en.message }
    enSignedBase64 = en.signedPdfBase64
    enSignedSha256 = en.signedSha256
    enRequestId = en.requestId
    enSignedBytes = en.signedPdfBytes
  }

  // Persist signed PDFs to Storage so downloads are reliable (API route proxies from storage).
  // MUST be private to prevent public access to accounting PDFs.
  const storageBucket = SECURE_ASSETS_BUCKET
  const originalStorageKey = `documents/${draftId}/original.he.pdf`
  const copyHeStorageKey = `documents/${draftId}/copy.he.pdf`
  const copyEnStorageKey = `documents/${draftId}/source.en.pdf`

  const uploadPdfIfMissing = async (storageKey: string, pdfBytes: Uint8Array) => {
    const res = await adminClient.storage
      .from(storageBucket)
      .upload(storageKey, pdfBytes, { contentType: "application/pdf", upsert: false })
    if (res.error) {
      const msg = String(res.error.message || "")
      // "already exists" is fine (immutable storage)
      if (msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("duplicate")) {
        return { ok: true as const, existed: true as const }
      }
      return { ok: false as const, message: res.error.message }
    }
    return { ok: true as const, existed: false as const }
  }

  tracker.step("storage_upload_start", { draft_id: draftId, which: "original_he", storage_key: originalStorageKey })
  let upOriginal: Awaited<ReturnType<typeof uploadPdfIfMissing>>
  try {
    upOriginal = await uploadPdfIfMissing(originalStorageKey, Uint8Array.from(originalFinal.signedPdfBytes as any))
  } catch (e: any) {
    tracker.fail("storage_upload_failed", e, { draft_id: draftId, which: "original_he", storage_key: originalStorageKey })
    throw e
  }
  if (!upOriginal.ok) {
    tracker.fail("storage_upload_failed", new Error(upOriginal.message ?? "upload_failed"), {
      draft_id: draftId, which: "original_he", storage_key: originalStorageKey,
    })
    return { ok: false, message: `Failed to upload signed PDF (original_he): ${upOriginal.message}` }
  }
  tracker.step("storage_upload_ok", { draft_id: draftId, which: "original_he", existed: !!(upOriginal as any).existed })

  tracker.step("storage_upload_start", { draft_id: draftId, which: "copy_he", storage_key: copyHeStorageKey })
  let upCopyHe: Awaited<ReturnType<typeof uploadPdfIfMissing>>
  try {
    upCopyHe = await uploadPdfIfMissing(copyHeStorageKey, Uint8Array.from(copyFinal.signedPdfBytes as any))
  } catch (e: any) {
    tracker.fail("storage_upload_failed", e, { draft_id: draftId, which: "copy_he", storage_key: copyHeStorageKey })
    throw e
  }
  if (!upCopyHe.ok) {
    tracker.fail("storage_upload_failed", new Error(upCopyHe.message ?? "upload_failed"), {
      draft_id: draftId, which: "copy_he", storage_key: copyHeStorageKey,
    })
    return { ok: false, message: `Failed to upload signed PDF (copy_he): ${upCopyHe.message}` }
  }
  tracker.step("storage_upload_ok", { draft_id: draftId, which: "copy_he", existed: !!(upCopyHe as any).existed })

  if (enSignedBytes) {
    tracker.step("storage_upload_start", { draft_id: draftId, which: "copy_en", storage_key: copyEnStorageKey })
    let upEn: Awaited<ReturnType<typeof uploadPdfIfMissing>>
    try {
      upEn = await uploadPdfIfMissing(copyEnStorageKey, Uint8Array.from(enSignedBytes as any))
    } catch (e: any) {
      tracker.fail("storage_upload_failed", e, { draft_id: draftId, which: "copy_en", storage_key: copyEnStorageKey })
      throw e
    }
    if (!upEn.ok) {
      tracker.fail("storage_upload_failed", new Error(upEn.message ?? "upload_failed"), {
        draft_id: draftId, which: "copy_en", storage_key: copyEnStorageKey,
      })
      return { ok: false, message: `Failed to upload signed PDF (copy_en): ${upEn.message}` }
    }
    tracker.step("storage_upload_ok", { draft_id: draftId, which: "copy_en", existed: !!(upEn as any).existed })
  }

  const usedUnsignedFallback = !!(originalFinal as any)?.unsignedFallback || !!(copyFinal as any)?.unsignedFallback
  const certFingerprint =
    (originalFinal as any)?.certInfo?.fingerprint_sha256 ||
    (originalFinal as any)?.certInfo?.fingerprint ||
    null

  const updateFields: any = {
    template_version_id: originalFinal.templateVersionId || null,
    pdf_sha256: originalFinal.unsignedSha256,
    signed_pdf_sha256: originalFinal.signedSha256,
    signing_cert_fingerprint: certFingerprint,
    signed_at: nowIso,
    signature_provider: usedUnsignedFallback ? "unsigned_dev_fallback" : "secure_signature",
    signature_certificate_id: certFingerprint,
    pdf_storage_key: originalStorageKey,
    pdf_storage_key_he_copy: copyHeStorageKey,
  }
  if (enSignedBytes) {
    updateFields.pdf_storage_key_en = copyEnStorageKey
  }

  const { error: metaError } = await adminClient
    .from("documents")
    .update(updateFields)
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_status", "draft")

  if (metaError) {
    return { ok: false, message: `Failed to persist signing metadata: ${metaError.message}` }
  }

  tracker.step("accounting_init_start", { draft_id: draftId })
  const { data: docForAccounting, error: docForAccountingError } = await supabase
    .from("documents")
    .select("document_type, total_amount")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .single()

  if (docForAccountingError) {
    tracker.fail("accounting_init_failed", docForAccountingError, { draft_id: draftId })
    console.error(`[finalizeDocument] Failed to load document for accounting init ${draftId}:`, docForAccountingError)
    return { ok: false, message: `Failed to finalize document: ${docForAccountingError.message}` }
  }
  tracker.step("accounting_init_ok", { draft_id: draftId })

  const docType = String((docForAccounting as any)?.document_type || documentType || "").toLowerCase()
  const totalAmountRaw = (docForAccounting as any)?.total_amount
  const totalAmount =
    typeof totalAmountRaw === "number" ? totalAmountRaw : totalAmountRaw ? Number(totalAmountRaw) : 0
  const totalAmountSafe = Number.isFinite(totalAmount) ? Number(totalAmount.toFixed(2)) : 0

  const isAlwaysClosedDoc = docType === "receipt" || docType === "invoice_receipt" || docType === "credit_note"

  const initialPaidAmount = isAlwaysClosedDoc ? totalAmountSafe : 0
  const initialCreditedAmount = 0
  const initialOutstandingBalance = isAlwaysClosedDoc ? 0 : totalAmountSafe
  const initialAccountingStatus = totalAmountSafe <= 0 || isAlwaysClosedDoc ? "paid" : "open"

  const isMissingOrMismatchedFinalizeRpc = (err: any) => {
    const code = String(err?.code || "")
    const msg = String(err?.message || "")
    return (
      code === "PGRST202" ||
      code === "PGRST205" ||
      msg.includes("Could not find the function public.finalize_document_with_period_guard") ||
      msg.includes("finalize_document_with_period_guard(") ||
      msg.includes("Could not find the function public.finalize_document_with_usage_guard") ||
      msg.includes("finalize_document_with_usage_guard(")
    )
  }

  let finalizeGuardData: any = null
  let finalizeGuardError: any = null
  let finalizeRpcMode:
    | "period_guard"
    | "v2_with_accounting"
    | "v1_no_accounting"
    | "legacy_minimal" = "period_guard"

  tracker.step("finalize_rpc_start", {
    draft_id: draftId,
    rpc_mode: "period_guard",
    accounting_status: initialAccountingStatus,
    paid_amount: initialPaidAmount,
    outstanding: initialOutstandingBalance,
  })

  // Prefer new period-based guard (anniversary periods + free hard cap).
  ;({ data: finalizeGuardData, error: finalizeGuardError } = await supabase.rpc(
    "finalize_document_with_period_guard",
    {
      p_company_id: companyId,
      p_document_id: draftId,
      p_now: nowIso,
      p_paid_amount: initialPaidAmount,
      p_credited_amount: initialCreditedAmount,
      p_outstanding_balance: initialOutstandingBalance,
      p_accounting_status: initialAccountingStatus,
    }
  ))

  if (finalizeGuardError && isMissingOrMismatchedFinalizeRpc(finalizeGuardError)) {
    finalizeRpcMode = "v2_with_accounting"

    ;({ data: finalizeGuardData, error: finalizeGuardError } = await supabase.rpc(
      "finalize_document_with_usage_guard",
      {
        p_company_id: companyId,
        p_document_id: draftId,
        p_now: nowIso,
        p_paid_amount: initialPaidAmount,
        p_credited_amount: initialCreditedAmount,
        p_outstanding_balance: initialOutstandingBalance,
        p_accounting_status: initialAccountingStatus,
      }
    ))
  }

  if (finalizeGuardError && isMissingOrMismatchedFinalizeRpc(finalizeGuardError)) {
    finalizeRpcMode = "legacy_minimal"

    ;({ data: finalizeGuardData, error: finalizeGuardError } = await supabase.rpc(
      "finalize_document_with_usage_guard",
      {
        p_company_id: companyId,
        p_document_id: draftId,
      }
    ))
  }

  if (finalizeGuardError) {
    tracker.fail("finalize_rpc_failed", finalizeGuardError, {
      draft_id: draftId,
      rpc_mode: finalizeRpcMode,
    })
    console.error(`[finalizeDocument] finalize_document_with_usage_guard failed for ${draftId}:`, finalizeGuardError)
    return { ok: false, message: finalizeGuardError.message, reason: null }
  }

  const finalizeRow = Array.isArray(finalizeGuardData) ? finalizeGuardData[0] : (finalizeGuardData as any)
  const finalizeOk = !!finalizeRow?.ok
  const reason = typeof finalizeRow?.reason === "string" ? finalizeRow.reason : null

  if (!finalizeOk) {
    tracker.fail("finalize_rpc_failed", new Error(reason || "finalize_rpc_returned_not_ok"), {
      draft_id: draftId,
      rpc_mode: finalizeRpcMode,
      reason,
    })
    const message =
      reason === "limit_reached"
        ? "הגעת למגבלת המסמכים החודשית. לא ניתן להפיק מסמכים חדשים."
        : reason === "trial_ended"
          ? "תקופת הניסיון הסתיימה. לא ניתן להפיק מסמכים חדשים."
          : reason === "subscription_expired"
            ? "המנוי פג. לא ניתן להפיק מסמכים חדשים."
            : reason === "account_blocked"
              ? "החשבון חסום. לא ניתן להפיק מסמכים חדשים."
              : "לא ניתן להפיק מסמך. נסה שוב."
    return { ok: false, message, reason }
  }

  tracker.step("finalize_rpc_ok", { draft_id: draftId, rpc_mode: finalizeRpcMode })
  tracker.step("finalize_done", { draft_id: draftId, doc_number_length: docNumber ? String(docNumber).length : 0 })

  console.log(`✅ [finalizeDocument] Document ${draftId} finalized successfully with PDF`)
  
  const successResponse = { ok: true, documentNumber: docNumber || undefined, reason: null };
  
  return {
    ...successResponse,
    signing: {
      pdf_hashes: {
        original_he_sha256: originalFinal.signedSha256,
        copy_he_sha256: copyFinal.signedSha256,
        copy_en_sha256: enSignedSha256,
      },
      signing_request_ids: {
        original_he: originalFinal.requestId,
        copy_he: copyFinal.requestId,
        copy_en: enRequestId,
      },
      signed_pdf_base64: {
        original_he: originalFinal.signedPdfBase64,
        copy_he: copyFinal.signedPdfBase64,
        copy_en: enSignedBase64,
      },
    },
  };
}