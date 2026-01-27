/**
 * Unified document workflow helpers
 * Provides consistent patterns for multi-tenant document management
 */

import { createClient } from "@/lib/supabase/server"
import { randomUUID } from "crypto"

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

  // Generate number atomically - this is the moment allocation happens
  const { data: docNumber, error: rpcError } = await supabase.rpc(
    "generate_document_number",
    {
      p_company_id: companyId,
      p_document_type: sequenceDocumentType,
    }
  )

  if (rpcError) {
    return { ok: false, message: rpcError.message }
  }

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

  // CRITICAL: Generate PDF AFTER updating document_number but BEFORE finalizing
  // This ensures PDF is uploaded to Storage before the document becomes immutable
  // Order: Update document_number → Generate PDF → Upload to Storage → Get storageKey from result → Set status to 'final'
  // NOTE: We use storageKey from generateDocumentPDF result directly, not from DB
  console.log(`[finalizeDocument] Generating PDF for document ${draftId} (document_number is now set)...`)
  
  let pdfStorageKey: string | null = null
  let pdfStorageKeyHeCopy: string | null = null
  let pdfStorageKeyEn: string | null = null
  let documentLanguage: "he" | "en" = "he"
  
  try {
    const { generateDocumentPDF } = await import("@/lib/pdf-service")

    const { data: langRow, error: langError } = await supabase
      .from("documents")
      .select("language")
      .eq("id", draftId)
      .single()
    if (langError) {
      return { ok: false, message: `Failed to resolve document language: ${langError.message}` }
    }
    documentLanguage = ((langRow as any)?.language as "he" | "en") || "he"

    // Generate Hebrew PDF (Original) - immutable
    const pdfResultHe = await generateDocumentPDF(draftId, {
      mode: "final",
      language: "he",
      variant: "original",
      isIssuance: true,
      requestId,
      context: "finalize",
    })
    
    if (!pdfResultHe.success) {
      const errorDetails = pdfResultHe.error || "Unknown error"
      console.error(`❌ [finalizeDocument] Hebrew PDF generation failed for document ${draftId}:`, {
        error: errorDetails,
        documentId: draftId
      })
      // CRITICAL: PDF generation failure should block finalization
      // Document cannot be finalized without PDF (regulatory requirement)
      return { 
        ok: false, 
        message: `Cannot finalize document: PDF generation failed: ${errorDetails}. Please try again or contact support.`
      }
    }
    
    // Use storageKey from result directly (don't rely on DB - it may be blocked)
    pdfStorageKey = pdfResultHe.storageKey || pdfResultHe.path || null
    
    if (!pdfStorageKey) {
      console.error(`[finalizeDocument] Hebrew PDF was generated but storageKey is missing from result for document ${draftId}`)
      return { 
        ok: false, 
        message: `Hebrew PDF was generated but storageKey was not returned. Please try again or contact support.`
      }
    }
    
    console.log(`✅ [finalizeDocument] Hebrew ORIGINAL PDF generated and uploaded to storage: ${pdfStorageKey}`)

    // Generate Hebrew COPY PDF (immutable, same content) for HE documents
    const pdfResultHeCopy = await generateDocumentPDF(draftId, {
      mode: "final",
      language: "he",
      variant: "copy",
      isIssuance: true,
      requestId,
      context: "finalize",
    })

    if (!pdfResultHeCopy.success) {
      const errorDetails = pdfResultHeCopy.error || "Unknown error"
      console.error(`❌ [finalizeDocument] Hebrew COPY PDF generation failed for document ${draftId}:`, {
        error: errorDetails,
        documentId: draftId
      })
      return { 
        ok: false, 
        message: `Cannot finalize document: Hebrew copy PDF generation failed: ${errorDetails}. Please try again or contact support.`
      }
    }

    pdfStorageKeyHeCopy = pdfResultHeCopy.storageKey || pdfResultHeCopy.path || null

    if (!pdfStorageKeyHeCopy) {
      console.error(`[finalizeDocument] Hebrew COPY PDF was generated but storageKey is missing from result for document ${draftId}`)
      return { 
        ok: false, 
        message: `Hebrew copy PDF was generated but storageKey was not returned. Please try again or contact support.`
      }
    }

    console.log(`✅ [finalizeDocument] Hebrew COPY PDF generated and uploaded to storage: ${pdfStorageKeyHeCopy}`)

    if (documentLanguage === "en") {
      // Generate English PDF (Faithful Copy/Translation) - only allowed in finalization
      const pdfResultEn = await generateDocumentPDF(draftId, { 
        mode: "final", 
        language: "en",
        allowEnInFinalization: true, // Explicit flag to allow EN in finalization
        isIssuance: true,
        requestId,
        context: "finalize",
      })

      if (!pdfResultEn.success) {
        const errorDetails = pdfResultEn.error || "Unknown error"
        console.error(`❌ [finalizeDocument] English PDF generation failed for document ${draftId}:`, {
          error: errorDetails,
          documentId: draftId
        })
        // CRITICAL: Both PDFs must be generated for finalization
        return { 
          ok: false, 
          message: `Cannot finalize document: English PDF generation failed: ${errorDetails}. Please try again or contact support.`
        }
      }

      pdfStorageKeyEn = pdfResultEn.storageKey || pdfResultEn.path || null

      if (!pdfStorageKeyEn) {
        console.error(`[finalizeDocument] English PDF was generated but storageKey is missing from result for document ${draftId}`)
        return { 
          ok: false, 
          message: `English PDF was generated but storageKey was not returned. Please try again or contact support.`
        }
      }

      console.log(`✅ [finalizeDocument] English PDF generated and uploaded to storage: ${pdfStorageKeyEn}`)
    }

    // Verify files exist in Storage (don't rely on DB - it may be blocked)
    const adminClient = (await import("@/lib/supabase/admin")).createAdminClient()
    const pdfFileName = pdfStorageKey.split("/").pop() || "original.he.pdf"
    const { data: fileList, error: listError } = await adminClient.storage
      .from("business-assets")
      .list(`documents/${draftId}`, {
        limit: 1,
        search: pdfFileName
      })
    
    if (listError || !fileList || fileList.length === 0) {
      console.error(`[finalizeDocument] Hebrew PDF file not found in Storage for document ${draftId}:`, {
        listError,
        pdfStorageKey,
        pdfFileName,
        fileCount: fileList?.length || 0,
      })
      return { 
        ok: false, 
        message: `Hebrew PDF was generated but file was not found in storage. Please try again or contact support.`
      }
    }
    
    console.log(`✅ [finalizeDocument] Verified Hebrew ORIGINAL PDF file exists in Storage: ${pdfStorageKey}`)

    if (!pdfStorageKeyHeCopy) {
      return { ok: false, message: "Hebrew COPY PDF storage key missing during verification." }
    }

    const pdfFileNameCopy = pdfStorageKeyHeCopy.split("/").pop() || "copy.he.pdf"
    const { data: fileListCopy, error: listErrorCopy } = await adminClient.storage
      .from("business-assets")
      .list(`documents/${draftId}`, {
        limit: 1,
        search: pdfFileNameCopy
      })

    if (listErrorCopy || !fileListCopy || fileListCopy.length === 0) {
      console.error(`[finalizeDocument] Hebrew COPY PDF file not found in Storage for document ${draftId}:`, {
        listError: listErrorCopy,
        pdfStorageKey: pdfStorageKeyHeCopy,
        pdfFileName: pdfFileNameCopy,
        fileCount: fileListCopy?.length || 0,
      })
      return { 
        ok: false, 
        message: `Hebrew COPY PDF was generated but file was not found in storage. Please try again or contact support.`
      }
    }

    console.log(`✅ [finalizeDocument] Verified Hebrew COPY PDF file exists in Storage: ${pdfStorageKeyHeCopy}`)

    if (documentLanguage === "en") {
      if (!pdfStorageKeyEn) {
        return { ok: false, message: "English PDF storage key missing during verification." }
      }
      const pdfFileNameEn = pdfStorageKeyEn.split("/").pop() || "source.en.pdf"
      const { data: fileListEn, error: listErrorEn } = await adminClient.storage
        .from("business-assets")
        .list(`documents/${draftId}`, {
          limit: 1,
          search: pdfFileNameEn
        })
      
      if (listErrorEn || !fileListEn || fileListEn.length === 0) {
        console.error(`[finalizeDocument] English PDF file not found in Storage for document ${draftId}:`, {
          listError: listErrorEn,
          pdfStorageKey: pdfStorageKeyEn,
          pdfFileName: pdfFileNameEn,
          fileCount: fileListEn?.length || 0,
        })
        return { 
          ok: false, 
          message: `English PDF was generated but file was not found in storage. Please try again or contact support.`
        }
      }
      
      console.log(`✅ [finalizeDocument] Verified English PDF file exists in Storage: ${pdfStorageKeyEn}`)
    }
    
  } catch (pdfError: any) {
    const errorMessage = pdfError?.message || String(pdfError)
    const errorStack = pdfError?.stack || "No stack trace"
    console.error(`❌ [finalizeDocument] PDF generation exception for document ${draftId}:`, {
      error: errorMessage,
      stack: errorStack,
      documentId: draftId,
      errorType: pdfError?.constructor?.name || typeof pdfError
    })
    // CRITICAL: PDF generation exception should block finalization
    return { 
      ok: false, 
      message: `Cannot finalize document: PDF generation threw exception: ${errorMessage}. Please try again or contact support.`
    }
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
