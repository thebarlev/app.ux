"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser, initializeSequence, isSequenceLocked } from "@/lib/document-helpers";

/**
 * Lock the starting number for a document sequence
 * This is a one-time operation that initializes the sequence
 */
export async function lockStartingNumberAction(params: {
  documentType: string;
  startingNumber: number;
  prefix?: string | null;
}) {
  try {
    const companyId = await getCompanyIdForUser();

    const result = await initializeSequence(
      companyId,
      params.documentType,
      params.startingNumber,
      params.prefix ?? undefined
    );

    if (!result.ok) {
      return { ok: false as const, message: result.message ?? "Failed to initialize sequence" };
    }

    return { ok: true as const };
  } catch (error: any) {
    return { ok: false as const, message: error?.message ?? "Unknown error" };
  }
}

/**
 * Get sequence information for a document type
 * Returns whether the sequence is locked and what the next number will be
 */
export async function getSequenceInfoAction(params: { documentType: string }) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Check if any documents of this type have been issued
    const { data: issued, error: issuedErr } = await supabase
      .from("documents")
      .select("id")
      .eq("company_id", companyId)
      .eq("document_type", params.documentType)
      .eq("document_status", "final")
      .limit(1);

    if (issuedErr) throw issuedErr;

    const hasIssued = (issued?.length ?? 0) > 0;

    // Get sequence info
    const { locked, currentNumber } = await isSequenceLocked({ companyId, documentType: params.documentType });

    const nextNumber = currentNumber !== null ? currentNumber + 1 : null;

    // Show modal if sequence is not locked (unless documents already issued)
    const shouldShowModal = !hasIssued && !locked;

    return {
      hasIssued,
      isLocked: locked,
      currentNumber,
      nextNumber,
      shouldShowModal,
    };
  } catch (error: any) {
    throw new Error(error?.message ?? "Failed to get sequence info");
  }
}
