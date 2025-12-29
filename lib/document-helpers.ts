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
  if (!user) throw new Error("not_authenticated")

  // Primary method: Direct ownership via companies.auth_user_id
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  
  if (company?.id) return company.id

  // Fallback: Try company_members (multi-tenant membership) if table exists
  try {
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle()
    
    if (membership?.company_id) return membership.company_id
  } catch (e) {
    // Table might not exist yet, continue to error
    console.warn("company_members table not accessible:", e)
  }

  throw new Error("company_not_found")
}

/**
 * Check if a sequence is locked for a given company and document type
 */
export async function isSequenceLocked(
  companyId: string,
  documentType: string
): Promise<{ locked: boolean; currentNumber: number | null }> {
  const supabase = await createClient()
  
  const { data } = await supabase
    .from("document_sequences")
    .select("is_locked, current_number")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .maybeSingle()

  return {
    locked: data?.is_locked ?? false,
    currentNumber: data?.current_number ?? null,
  }
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
