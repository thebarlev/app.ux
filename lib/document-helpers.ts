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
import { callShaamConfirmationNumber } from "@/lib/shaam/invoice-allocation"
import { getDecryptedTokensForCompany, markConnectionError, recordShaamEvent, refreshShaamTokenManual } from "@/lib/shaam/tokens"

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

  console.log("[getCompanyIdForUser] User ID:", user.id);

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (membershipError) {
    console.error("[getCompanyIdForUser] company_members error:", membershipError)
  }

  if (membership?.company_id) {
    console.log("[getCompanyIdForUser] ✅ Found via company_members:", membership.company_id);
    return membership.company_id
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (companyError) {
    console.error("[getCompanyIdForUser] companies error:", companyError)
  }

  if (company?.id) {
    console.log("[getCompanyIdForUser] ✅ Found via companies.auth_user_id:", company.id);
    return company.id
  }

  console.error("[getCompanyIdForUser] ❌ No company found for user:", user.id);
  throw new Error("company_not_found")
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
  opts?: { createdByName?: string | null; createdByEmail?: string | null }
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

  const requestId = randomUUID()
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const sequenceDocumentType = toSequenceDocumentType(documentType)

  const { data: existingDoc, error: existingError } = await supabase
    .from("documents")
    .select("document_number")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (existingError) {
    return { ok: false, message: existingError.message }
  }

  let docNumber = existingDoc?.document_number ?? null

  if (!docNumber) {
    const { data: generatedNumber, error: rpcError } = await supabase.rpc(
      "generate_document_number",
      {
        p_company_id: companyId,
        p_document_type: sequenceDocumentType,
      }
    )

    if (rpcError) {
      return { ok: false, message: rpcError.message }
    }

    docNumber = generatedNumber

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
      console.error(`[finalizeDocument] Failed to update document_number for document ${draftId}:`, updateNumberError)
      return { ok: false, message: `Failed to update document number: ${updateNumberError.message}` }
    }
    
    console.log(`✅ [finalizeDocument] Document ${draftId} updated with document_number: ${docNumber}`)
  }

  // ====================================================
  // Phase 2 (SHAAM): allocation number for high-value invoices (sandbox only)
  // Applies ONLY to: tax_invoice, invoice_receipt (invoiceReceipt)
  // Business rule precision:
  // - Apply only from invoice_date >= 2026-01-01
  // - Require when subtotal (before VAT) >= global threshold (invoice_allocation_threshold_ils)
  // - Exempt issuer business_type == 'osek_patur'
  // ====================================================
  if (documentType === "tax_invoice" || documentType === "invoiceReceipt") {
    const redirectTo = "/dashboard/settings/integrations/shaam"
    const nowIso = new Date().toISOString()

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
          "id, document_type, issue_date, document_number, subtotal, vat_amount, total_amount, customer_id, customer_tax_id, requires_allocation_number, allocation_status, allocation_number, shaam_error_id, invoice_decision_type"
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

    if (!companyErr && !docErr && companyRow && docRow) {
      const dbDocType = String((docRow as any).document_type || "")
      const isInvoiceLike = dbDocType === "tax_invoice" || dbDocType === "invoice_receipt"

      const issueDateYmd = (docRow as any).issue_date ? String((docRow as any).issue_date).slice(0, 10) : ""
      const isInEffect = issueDateYmd >= "2026-01-01"

      const businessType = typeof (companyRow as any).business_type === "string" ? String((companyRow as any).business_type) : ""
      const isExemptOsekPatur = businessType === "osek_patur"

      const thresholdRaw = thresholdRow?.setting_value ? String(thresholdRow.setting_value) : "10000"
      const thresholdIls = Number(thresholdRaw)
      const thresholdSafe = Number.isFinite(thresholdIls) && thresholdIls > 0 ? thresholdIls : 10000

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

      const requiresAllocation =
        isInvoiceLike && isInEffect && !isExemptOsekPatur && paymentAmountSafe >= thresholdSafe

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
          if (!customerVatDigits && (docRow as any).customer_id) {
            const { data: customerRow } = await adminClient
              .from("customers")
              .select("tax_id")
              .eq("id", (docRow as any).customer_id)
              .eq("company_id", companyId)
              .maybeSingle()
            customerVatDigits = customerRow?.tax_id ? String(customerRow.tax_id).replace(/\D/g, "") : ""
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

          if (!Number.isInteger(issuerVat) || issuerVat <= 0 || !Number.isInteger(customerVat) || customerVat <= 0) {
            await recordShaamEvent({
              companyId,
              eventType: "allocation_failed",
              payload: { document_id: draftId, reason: "missing_vat_numbers" },
            })
            return { ok: false, message: "חסר מספר עוסק ללקוח או לעסק. עדכן פרטי לקוח ונסה שוב.", reason: "shaam_allocation_missing_vat" }
          }

          // Ensure we have tokens; refresh proactively if expired.
          const tokens0 = await getDecryptedTokensForCompany({ companyId })
          if (!tokens0.ok) {
            return {
              ok: false,
              message: "יש להתחבר לרשות המסים כדי להפיק מסמך זה.",
              reason: "shaam_reconnect_required",
              shaam: { kind: "reconnect_required", redirect_to: redirectTo },
            }
          }

          const expiresAt = tokens0.expiresAt ? new Date(tokens0.expiresAt).getTime() : NaN
          if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
            const refreshed = await refreshShaamTokenManual({ companyId, ignoreCooldown: true })
            if (!refreshed.ok) {
              await markConnectionError({
                companyId,
                status: "expired",
                errorCode: "refresh_failed",
                errorMessage: "refresh_failed",
              })
              return {
                ok: false,
                message: "תוקף החיבור לרשות המסים פג. התחבר מחדש כדי להמשיך.",
                reason: "shaam_reconnect_required",
                shaam: { kind: "reconnect_required", redirect_to: redirectTo },
              }
            }
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

          const makeCall = async () => {
            const tokens = await getDecryptedTokensForCompany({ companyId })
            if (!tokens.ok) return { ok: false as const, kind: "unauthorized" as const, provider_json: { error: "missing_tokens" } }
            return await callShaamConfirmationNumber({
              accessToken: tokens.accessToken,
              payload: {
                customer_vat_number: customerVat,
                vat_number: issuerVat,
                payment_amount: paymentAmountSafe,
                vat_amount: vatAmountSafe,
                invoice_date: issueDateYmd,
                invoice_reference_number: invoiceReference,
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

          if (callRes.ok && callRes.kind === "received") {
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
    const rendered = await renderDeterministicPdfBytes({
      documentId: draftId,
      language: args.language,
      documentCopyLabel: args.label,
      templateVersionId: args.templateVersionId,
    })
    if (!rendered.ok) return { ok: false as const, message: rendered.message }

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
    
        metadata: { ...metadataToSendBase, unsigned_pdf_sha256: unsignedSha },
    
        pdfBytes,
    })
    }

    const signing = await attemptSign(rendered.pdfBytes, rendered.pdfSha256, "stamped")
    if (!signing.ok) {
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

  const upOriginal = await uploadPdfIfMissing(originalStorageKey, Uint8Array.from(originalFinal.signedPdfBytes as any))
  if (!upOriginal.ok) return { ok: false, message: `Failed to upload signed PDF (original_he): ${upOriginal.message}` }

  const upCopyHe = await uploadPdfIfMissing(copyHeStorageKey, Uint8Array.from(copyFinal.signedPdfBytes as any))
  if (!upCopyHe.ok) return { ok: false, message: `Failed to upload signed PDF (copy_he): ${upCopyHe.message}` }

  if (enSignedBytes) {
    const upEn = await uploadPdfIfMissing(copyEnStorageKey, Uint8Array.from(enSignedBytes as any))
    if (!upEn.ok) return { ok: false, message: `Failed to upload signed PDF (copy_en): ${upEn.message}` }
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

  const { data: docForAccounting, error: docForAccountingError } = await supabase
    .from("documents")
    .select("document_type, total_amount")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .single()

  if (docForAccountingError) {
    console.error(`[finalizeDocument] Failed to load document for accounting init ${draftId}:`, docForAccountingError)
    return { ok: false, message: `Failed to finalize document: ${docForAccountingError.message}` }
  }

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
    console.error(`[finalizeDocument] finalize_document_with_usage_guard failed for ${draftId}:`, finalizeGuardError)
    return { ok: false, message: finalizeGuardError.message, reason: null }
  }

  const finalizeRow = Array.isArray(finalizeGuardData) ? finalizeGuardData[0] : (finalizeGuardData as any)
  const finalizeOk = !!finalizeRow?.ok
  const reason = typeof finalizeRow?.reason === "string" ? finalizeRow.reason : null

  if (!finalizeOk) {
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