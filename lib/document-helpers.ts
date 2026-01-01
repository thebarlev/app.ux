/**
 * Unified document workflow helpers
 * Provides consistent patterns for multi-tenant document management
 */

import { createClient } from "@/lib/supabase/server"

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

  // Check if already exists
  const { data: existing } = await supabase
    .from("document_sequences")
    .select("id, is_locked")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
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
      document_type: documentType,
      starting_number: startingNumber,
      current_number: startingNumber - 1,
      prefix: prefix ?? "",
      is_locked: true,
      locked_at: new Date().toISOString(),
    })

  if (error) return { ok: false, message: error.message }
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

  console.log("[isSequenceLocked] Called with params:", params);

  if (!params.companyId || params.companyId === "undefined") {
    console.error("[isSequenceLocked] ❌ Invalid companyId:", params.companyId);
    return { locked: false, currentNumber: null };
  }

  const { data, error } = await supabase
    .from("document_sequences")
    .select("is_locked, current_number, starting_number, prefix")
    .eq("company_id", params.companyId)
    .eq("document_type", params.documentType)
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

  const { data: sequence } = await supabase
    .from("document_sequences")
    .select("current_number, starting_number, prefix, is_locked")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .maybeSingle()

  if (!sequence) {
    // Sequence not initialized yet
    return { nextNumber: null, formatted: null }
  }

  // Next number is current_number + 1 (or starting_number if current is 0)
  const nextNum = Math.max(sequence.current_number + 1, sequence.starting_number)
  const prefix = sequence.prefix || ""
  const formatted = `${prefix}${String(nextNum).padStart(6, "0")}`

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
  const supabase = await createClient()

  // Generate number atomically - this is the moment allocation happens
  const { data: docNumber, error: rpcError } = await supabase.rpc(
    "generate_document_number",
    {
      p_company_id: companyId,
      p_document_type: documentType,
    }
  )

  if (rpcError) {
    return { ok: false, message: rpcError.message }
  }

  // Update document to finalized status
  const { data, error } = await supabase
    .from("documents")
    .update({
      document_number: docNumber,
      document_status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_status", "draft") // Only drafts can be finalized
    .select("id, document_number")
    .single()

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true, documentNumber: data.document_number }
}
