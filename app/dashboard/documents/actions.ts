"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser, initializeSequence, isSequenceLocked } from "@/lib/document-helpers";

export type DocumentsListFilters = {
  search?: string;
  documentType?: string;
  page?: number;
  pageSize?: number;
};

export type DocumentListItem = {
  id: string;
  document_number: string | null;
  document_type: string;
  document_date: string | null;
  customer_name: string | null;
  total_amount: number | null;
  currency: string | null;
  document_status: string;
  created_at: string;
};

export type DocumentsListResult = {
  documents: DocumentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

/**
 * Fetch all documents for the current user's company with filters
 */
export async function getAllDocumentsListAction(
  filters: DocumentsListFilters = {}
): Promise<{ ok: boolean; data?: DocumentsListResult; message?: string }> {
  try {
    const supabase = await createClient();
    
    // Get company ID
    let companyId: string;
    try {
      companyId = await getCompanyIdForUser();
    } catch (e: any) {
      console.error("Failed to get company ID:", e);
      return {
        ok: true,
        data: {
          documents: [],
          totalCount: 0,
          page: 1,
          pageSize: 50,
        },
      };
    }

    const {
      search = "",
      documentType,
      page = 1,
      pageSize = 50,
    } = filters;

    // Build query
    let query = supabase
      .from("documents")
      .select("*", { count: "exact" })
      .eq("company_id", companyId);

    // Document type filter
    if (documentType && documentType !== "all") {
      query = query.eq("document_type", documentType);
    }

    // Search filter (document_number, customer_name)
    if (search && search.trim()) {
      query = query.or(
        `document_number.ilike.%${search}%,customer_name.ilike.%${search}%`
      );
    }

    // Sorting: newest first (by created_at desc)
    query = query.order("created_at", { ascending: false });

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: documents, error, count } = await query;

    if (error) {
      return { ok: false, message: error.message };
    }

    // Transform to DocumentListItem format
    const items: DocumentListItem[] = (documents || []).map((doc) => ({
      id: doc.id,
      document_number: doc.document_number,
      document_type: doc.document_type,
      document_date: doc.issue_date || doc.created_at,
      customer_name: doc.customer_name || null,
      total_amount: doc.total_amount || null,
      currency: doc.currency || "ILS",
      document_status: doc.document_status,
      created_at: doc.created_at,
    }));

    return {
      ok: true,
      data: {
        documents: items,
        totalCount: count || 0,
        page,
        pageSize,
      },
    };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to fetch documents" };
  }
}

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
