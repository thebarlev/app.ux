/**
 * Unified document workflow helpers
 * Provides consistent patterns for multi-tenant document management
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"
import { isDigitalSignaturesEnabled } from "@/lib/documents/signing/feature-flags"
import { createSigningRequest } from "@/lib/documents/signing/secure-signature-client"

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

/**
 * Get the company ID for the currently authenticated user
 * Checks both company_members (multi-tenant) and companies.auth_user_id (owner)
 */
export async function getCompanyIdForUser(): Promise<string> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error("[getCompanyIdForUser] ❌ No authenticated user");
    throw new Error("not_authenticated");
  }

  console.log("[getCompanyIdForUser] User ID:", user.id);

  // 1️⃣ קודם מנסים company_members (זה המקור האמיתי)
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

  // 2️⃣ אם אין – מנסים בעלות ישירה (fallback)
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

  // 3️⃣ אם כלום לא נמצא – שגיאה אמיתית
  console.error("[getCompanyIdForUser] ❌ No company found for user:", user.id);
  throw new Error("company_not_found")
}

/**
 * Initialize a document sequence with a starting number
 * This should only be called once per company/document_type combination
 */
export async function initializeSequence(
  companyId: string,
  documentType: string,
  startingNumber: number,
  prefix?: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const sequenceDocumentType = toSequenceDocumentType(documentType)

  // Check if already exists
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
    // Update existing unlocked sequence
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

  // Create new sequence
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

/**
 * בודק האם המספור של סוג מסמך מסוים נעול עבור חברה מסוימת
 * Check if a document sequence is locked for a specific company
 */
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
    // אין עדיין שורה למספור – לא נעול, ואין current_number
    console.log("[isSequenceLocked] No sequence found, returning unlocked");
    return { locked: false, currentNumber: null }
  }

  console.log("[isSequenceLocked] ✅ Result:", { locked: !!data.is_locked, currentNumber: data.current_number });

  return {
    locked: !!data.is_locked,
    currentNumber: typeof data.current_number === "number" ? data.current_number : null,
  }
}

/**
 * Get a preview of what the next document number will be
 * WITHOUT allocating it or changing database state
 * This is safe to call multiple times and shows users what number they'll get
 */
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
    // Sequence not initialized yet
    return { nextNumber: null, formatted: null }
  }

  // Next number is current_number + 1 (or starting_number if current is 0)
  const nextNum = Math.max(sequence.current_number + 1, sequence.starting_number)
  const prefix = sequence.prefix || ""
  // Return pure number without zero-padding
  // Examples: 1, 99, 100, 1543 (no leading zeros)
  const formatted = `${prefix}${nextNum}`

  return { nextNumber: nextNum, formatted }
}

/**
 * Finalize a draft document by assigning it a document number
 * Uses the generate_document_number RPC to atomically increment and assign
 * This is the ONLY function that should allocate document numbers
 */
export async function finalizeDocument(
  draftId: string,
  companyId: string,
  documentType: string
): Promise<{ ok: boolean; documentNumber?: string; message?: string }> {
  const requestId = randomUUID()
  const supabase = await createClient()
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
    // Generate number atomically - this is the moment allocation happens
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

    // CRITICAL: Update document_number BEFORE generating PDF
    // This ensures document_number is available in prepareDocumentData when rendering the template
    // Order: Generate number → Update document_number (still draft) → Generate PDF → Set status to 'final'
    console.log(`[finalizeDocument] Updating document ${draftId} with document_number: ${docNumber} (before PDF generation)...`)
    
    const { error: updateNumberError } = await supabase
      .from("documents")
      .update({
        document_number: docNumber,
      })
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("document_status", "draft") // Only drafts can be updated
    
    if (updateNumberError) {
      console.error(`[finalizeDocument] Failed to update document_number for document ${draftId}:`, updateNumberError)
      return { ok: false, message: `Failed to update document number: ${updateNumberError.message}` }
    }
    
    console.log(`✅ [finalizeDocument] Document ${draftId} updated with document_number: ${docNumber}`)
  }

  // CRITICAL: Generate PDF AFTER updating document_number but BEFORE finalizing
  // New flow: deterministic unsigned PDF -> Secure Signature -> store signed PDF -> finalize.
  console.log(`[finalizeDocument] Generating deterministic PDF + signing for document ${draftId}...`)

  if (!isDigitalSignaturesEnabled()) {
    return {
      ok: false,
      message:
        "Digital signing is required for issuing accounting documents. Enable DIGITAL_SIGNATURES_ENABLED=true and configure Secure Signature env vars.",
    }
  }

  const adminClient = createAdminClient()
  const nowIso = new Date().toISOString()

  // Ensure a frozen issuance timestamp exists (used to replace all dynamic 'now' placeholders).
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
  const docNumber: string | null = (langRow as any)?.document_number ? String((langRow as any).document_number) : null
  const issueDate: string | null = (langRow as any)?.issue_date ? String((langRow as any).issue_date) : null

  const { renderDeterministicPdfBytes } = await import("@/lib/pdf-service")

  const storageBucket = "business-assets"
  const originalKey = `documents/${draftId}/original.he.signed.pdf`
  const copyKey = `documents/${draftId}/copy.he.signed.pdf`
  const enKey = `documents/${draftId}/source.en.signed.pdf`

  const signAndUpload = async (args: {
    language: "he" | "en"
    variant: "original" | "copy"
    storageKey: string
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
    const signing = await createSigningRequest({
      businessId: companyId,
      externalDocId,
      metadata: {
        document_id: draftId,
        document_number: docNumber,
        document_type: dbDocumentType,
        issue_date: issueDate,
        variant: args.variant,
        language: args.language,
        unsigned_pdf_sha256: rendered.pdfSha256,
        template_version_id: rendered.templateVersionId,
        pdf_generated_at: rendered.frozenNowIso,
      },
      pdfBytes: rendered.pdfBytes,
    })
    if (!signing.ok) {
      return { ok: false as const, message: `Signing failed (${signing.code}): ${signing.message}` }
    }

    const { error: uploadError } = await adminClient.storage
      .from(storageBucket)
      .upload(args.storageKey, signing.signedPdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      })

    // If already exists, treat as success (idempotent finalize retries).
    if (uploadError && !String(uploadError.message || "").includes("already exists")) {
      return { ok: false as const, message: `Failed to upload signed PDF: ${uploadError.message}` }
    }

    // Audit events per variant
    try {
      await adminClient.from("document_events").insert({
        document_id: draftId,
        company_id: companyId,
        event_type: "signed",
        performed_by: null,
        event_data: {
          provider: "secure_signature",
          request_id: signing.requestId,
          variant: args.variant,
          language: args.language,
          storage_key: args.storageKey,
          unsigned_pdf_sha256: rendered.pdfSha256,
          signed_pdf_sha256: signing.signedPdfSha256,
          cert_info: signing.certInfo,
          hashes: signing.hashes,
          events: signing.events,
        },
      })
    } catch {
      // ignore
    }

    return {
      ok: true as const,
      storageKey: args.storageKey,
      unsignedSha256: rendered.pdfSha256,
      signedSha256: signing.signedPdfSha256,
      templateVersionId: rendered.templateVersionId,
      certInfo: signing.certInfo,
      hashes: signing.hashes,
      events: signing.events,
    }
  }

  // Render+sign original HE
  const original = await signAndUpload({
    language: "he",
    variant: "original",
    storageKey: originalKey,
    label: "מקור",
    templateVersionId: (langRow as any)?.template_version_id || null,
  })
  if (!original.ok) return { ok: false, message: original.message }

  // Render+sign HE copy
  const copy = await signAndUpload({
    language: "he",
    variant: "copy",
    storageKey: copyKey,
    label: "העתק נאמן למקור",
    templateVersionId: original.templateVersionId,
  })
  if (!copy.ok) return { ok: false, message: copy.message }

  // Render+sign EN copy (only for EN documents)
  let enStorageKey: string | null = null
  if (documentLanguage === "en") {
    const en = await signAndUpload({
      language: "en",
      variant: "copy",
      storageKey: enKey,
      label: "Certified Copy",
      templateVersionId: original.templateVersionId,
    })
    if (!en.ok) return { ok: false, message: en.message }
    enStorageKey = en.storageKey
  }

  // Persist template snapshot used (if any) and hashes for the canonical original.
  const certFingerprint =
    (original as any)?.certInfo?.fingerprint_sha256 ||
    (original as any)?.certInfo?.fingerprint ||
    null

  const { error: metaError } = await adminClient
    .from("documents")
    .update({
      template_version_id: original.templateVersionId || null,
      pdf_storage_key: original.storageKey,
      pdf_storage_key_he_copy: copy.storageKey,
      pdf_storage_key_en: documentLanguage === "en" ? enStorageKey : null,
      pdf_sha256: original.unsignedSha256,
      signed_pdf_sha256: original.signedSha256,
      signing_cert_fingerprint: certFingerprint,
      signed_at: nowIso,
      signature_provider: "secure_signature",
      signature_certificate_id: certFingerprint,
      // IMPORTANT: do NOT set signed_hash here; DB trigger blocks further updates once signed_hash is set.
    })
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_status", "draft")

  if (metaError) {
    return { ok: false, message: `Failed to persist signing metadata: ${metaError.message}` }
  }

  // Initialize accounting fields on finalization.
  // IMPORTANT:
  // - We do NOT introduce new DB status values.
  // - This is only the initial state for newly finalized docs, before any document_links exist.
  // - Later, document_links triggers will recompute paid/credited/outstanding/accounting_status.
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

  // Receipts / invoice-receipts are always "closed" (no outstanding balance) from issuance.
  // Credit notes are treated as "closed" documents themselves; they "cancel" other documents via links.
  const isAlwaysClosedDoc = docType === "receipt" || docType === "invoice_receipt" || docType === "credit_note"

  const initialPaidAmount = isAlwaysClosedDoc ? totalAmountSafe : 0
  const initialCreditedAmount = 0
  const initialOutstandingBalance = isAlwaysClosedDoc ? 0 : totalAmountSafe
  const initialAccountingStatus = totalAmountSafe <= 0 || isAlwaysClosedDoc ? "paid" : "open"

  // Now update document to finalized status
  // document_number was already updated above (before PDF generation)
  // pdf_storage_key was already saved by generateDocumentPDF (while document was still 'draft')
  // This update only changes status to 'final', which is allowed
  const { data, error } = await supabase
    .from("documents")
    .update({
      document_status: "final",
      finalized_at: new Date().toISOString(),
      paid_amount: initialPaidAmount,
      credited_amount: initialCreditedAmount,
      outstanding_balance: initialOutstandingBalance,
      accounting_status: initialAccountingStatus,
    })
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_status", "draft") // Only drafts can be finalized
    .select("id, document_number, document_type")
    .single()

  if (error) {
    console.error(`[finalizeDocument] Failed to update document ${draftId} to finalized status:`, error)
    return { ok: false, message: error.message }
  }

  console.log(`✅ [finalizeDocument] Document ${draftId} finalized successfully with PDF`)
  
  const successResponse = { ok: true, documentNumber: data.document_number };
  
  return successResponse;
}
