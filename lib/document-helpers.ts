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
        // Retry with an ASCII-only stamped footer so the final signed PDF still contains a footer.
        // (DSIGN sometimes rejects PDFs with embedded Hebrew fonts.)
        try {
          const rawBytes: Buffer = (rendered as any).rawPdfBytes
          const asciiStamped = await stampPdfFooter({
            pdfBytes: rawBytes,
            language: "en",
            generatedAtText: String((rendered as any).frozenNowIso || ""),
            generatedByText: "VOW",
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
    signature_provider: "secure_signature",
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
      msg.includes("Could not find the function public.finalize_document_with_usage_guard") ||
      msg.includes("finalize_document_with_usage_guard(")
    )
  }

  let finalizeGuardData: any = null
  let finalizeGuardError: any = null
  let finalizeRpcMode: "v2_with_accounting" | "v1_no_accounting" | "legacy_minimal" = "v2_with_accounting"

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

  if (finalizeGuardError && isMissingOrMismatchedFinalizeRpc(finalizeGuardError)) {
    finalizeRpcMode = "v1_no_accounting"

    ;({ data: finalizeGuardData, error: finalizeGuardError } = await supabase.rpc(
      "finalize_document_with_usage_guard",
      {
        p_company_id: companyId,
        p_document_id: draftId,
        p_now: nowIso,
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
    return { ok: false, message: finalizeGuardError.message }
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
    return { ok: false, message }
  }

  console.log(`✅ [finalizeDocument] Document ${draftId} finalized successfully with PDF`)
  
  const successResponse = { ok: true, documentNumber: docNumber || undefined };
  
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