/**
 * Unified document workflow helpers
 * Provides consistent patterns for multi-tenant document management
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"
import { isDigitalSignaturesEnabled } from "@/lib/documents/signing/feature-flags"
import { createSigningRequest } from "./documents/signing/secure-signature-client"

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'document-helpers.ts:277',message:'Company data fetched from DB',data:{companyId:companyId.substring(0,8),companyName:companyData?.company_name,taxId:companyData?.tax_id,registrationNumber:companyData?.registration_number,companyNumber:companyData?.company_number,contactFullName:companyData?.contact_full_name,email:companyData?.email},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Determine the business tax ID from available fields
  const businessTaxId = companyData?.tax_id || companyData?.registration_number || companyData?.company_number || null;
  const businessContactName = companyData?.contact_full_name || null;

  // Get current user for event logging
  const { data: { user } } = await supabase.auth.getUser();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'document-helpers.ts:293',message:'User data for signing',data:{userId:user?.id?.substring(0,8),userEmail:user?.email,userName:user?.user_metadata?.full_name||user?.user_metadata?.name,createdByName:opts?.createdByName,createdByEmail:opts?.createdByEmail,resolvedTaxId:businessTaxId,resolvedContactName:businessContactName},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A,B'})}).catch(()=>{});

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
    
    // #region agent log
    const metadataToSend = {
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
    };
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'document-helpers.ts:343',message:'Metadata being sent to dsign',data:{businessName:companyData?.company_name?.trim()||companyId,businessTaxId:businessTaxId,metadata:metadataToSend},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const signing = await createSigningRequest({
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
    
      metadata: metadataToSend,
    
      pdfBytes: rendered.pdfBytes,
    })
        if (!signing.ok) {
      return { ok: false as const, message: `Signing failed (${signing.code}): ${signing.message}` }
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'document-helpers.ts:398',message:'Saving to document_events',data:{performedBy:user?.id?.substring(0,8),eventData:eventDataToSave},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      await adminClient.from("document_events").insert({
        document_id: draftId,
        company_id: companyId,
        event_type: "signed",
        performed_by: user?.id || null,
        event_data: eventDataToSave,
      })
    } catch (e: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'document-helpers.ts:414',message:'Error saving document_events',data:{error:e?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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
      signedPdfBase64: signing.signedPdfBytes.toString("base64"),
    }
  }

  const original = await signAndReturn({
    language: "he",
    variant: "original",
    label: "מקור",
    templateVersionId: (langRow as any)?.template_version_id || null,
  })
  if (!original.ok) return { ok: false, message: original.message }

  const copy = await signAndReturn({
    language: "he",
    variant: "copy",
    label: "העתק נאמן למקור",
    templateVersionId: original.templateVersionId,
  })
  if (!copy.ok) return { ok: false, message: copy.message }

  let enSignedBase64: string | null = null
  let enSignedSha256: string | null = null
  let enRequestId: string | null = null
  if (documentLanguage === "en") {
    const en = await signAndReturn({
      language: "en",
      variant: "copy",
      label: "Certified Copy",
      templateVersionId: original.templateVersionId,
    })
    if (!en.ok) return { ok: false, message: en.message }
    enSignedBase64 = en.signedPdfBase64
    enSignedSha256 = en.signedSha256
    enRequestId = en.requestId
  }

  const certFingerprint =
    (original as any)?.certInfo?.fingerprint_sha256 ||
    (original as any)?.certInfo?.fingerprint ||
    null

  const { error: metaError } = await adminClient
    .from("documents")
    .update({
      template_version_id: original.templateVersionId || null,
      pdf_sha256: original.unsignedSha256,
      signed_pdf_sha256: original.signedSha256,
      signing_cert_fingerprint: certFingerprint,
      signed_at: nowIso,
      signature_provider: "secure_signature",
      signature_certificate_id: certFingerprint,
    })
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

  const { data: finalizeGuardData, error: finalizeGuardError } = await supabase.rpc(
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
  )

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
        original_he_sha256: original.signedSha256,
        copy_he_sha256: copy.signedSha256,
        copy_en_sha256: enSignedSha256,
      },
      signing_request_ids: {
        original_he: original.requestId,
        copy_he: copy.requestId,
        copy_en: enRequestId,
      },
      signed_pdf_base64: {
        original_he: original.signedPdfBase64,
        copy_he: copy.signedPdfBase64,
        copy_en: enSignedBase64,
      },
    },
  };
}