"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser, initializeSequence, isSequenceLocked } from "@/lib/document-helpers";

export type DocumentsListFilters = {
  search?: string;
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type DocumentListItem = {
  id: string;
  document_number: string | null;
  document_type: string;
  document_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  document_description: string | null;
  payment_method: string | null;
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
      dateFrom,
      dateTo,
      page = 1,
      pageSize = 50,
    } = filters;

    // Build query - select specific fields including description
    let query = supabase
      .from("documents")
      .select(`
        id,
        document_number,
        document_type,
        issue_date,
        created_at,
        customer_id,
        customer_name,
        document_description,
        total_amount,
        currency,
        document_status,
        company_id
      `, { count: "exact" })
      .eq("company_id", companyId);

    // Document type filter
    if (documentType && documentType !== "all") {
      const raw = String(documentType);
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length <= 1) {
        query = query.eq("document_type", parts[0] || raw);
      } else {
        query = query.in("document_type", parts);
      }
    }

    // Date range filter:
    // Prefer issue_date when present, otherwise fall back to created_at.
    // (DocumentListClient displays document_date = issue_date || created_at)
    const startOfDayUtc = (d: string) => `${d}T00:00:00Z`;
    const endOfDayUtc = (d: string) => `${d}T23:59:59Z`;

    if (dateFrom && dateTo) {
      query = query.or(
        `and(issue_date.gte.${dateFrom},issue_date.lte.${dateTo}),and(issue_date.is.null,created_at.gte.${startOfDayUtc(
          dateFrom
        )},created_at.lte.${endOfDayUtc(dateTo)})`
      );
    } else if (dateFrom) {
      query = query.or(
        `issue_date.gte.${dateFrom},and(issue_date.is.null,created_at.gte.${startOfDayUtc(dateFrom)})`
      );
    } else if (dateTo) {
      query = query.or(
        `issue_date.lte.${dateTo},and(issue_date.is.null,created_at.lte.${endOfDayUtc(dateTo)})`
      );
    }

    // Search filter (document_number, customer_name)
    if (search && search.trim()) {
      const s = search.trim();
      const orParts: string[] = [
        `document_number.ilike.%${s}%`,
        `customer_name.ilike.%${s}%`,
      ];

      // Also allow free-text search by amount when user types a number.
      // We support:
      // - exact match: total_amount == N
      // - partial (prefix) match: if user types an integer K, match K.xx amounts via [K, K+1)
      //   (e.g., "14" matches 14.00–14.99)
      const numericCandidate = s.replace(/,/g, "");
      if (/^\d+(\.\d+)?$/.test(numericCandidate)) {
        const n = Number(numericCandidate);
        if (Number.isFinite(n)) {
          orParts.push(`total_amount.eq.${n}`);
          const dot = numericCandidate.includes(".");
          const decimals = dot ? (numericCandidate.split(".")[1]?.length || 0) : 0;
          const step = dot ? Math.pow(10, -Math.min(decimals, 6)) : 1;
          const upper = n + step;
          // range for partial match (prefix)
          orParts.push(`and(total_amount.gte.${n},total_amount.lt.${upper})`);
        }
      }

      query = query.or(orParts.join(","));
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

    // Fetch payment methods for each document (first payment method from line items)
    const documentIds = (documents || []).map(d => d.id);
    const { data: lineItemsData } = await supabase
      .from("document_line_items")
      .select("document_id, description")
      .in("document_id", documentIds)
      .order("line_number", { ascending: true })
      .limit(1000); // Reasonable limit
    
    // Create a map of document_id -> first payment method
    const paymentMethodMap = new Map<string, string>();
    (lineItemsData || []).forEach((item: any) => {
      if (!paymentMethodMap.has(item.document_id) && item.description) {
        paymentMethodMap.set(item.document_id, item.description);
      }
    });

    // Transform to DocumentListItem format
    const items: DocumentListItem[] = (documents || []).map((doc) => ({
      id: doc.id,
      document_number: doc.document_number,
      document_type: doc.document_type,
      document_date: doc.issue_date || doc.created_at,
      customer_id: doc.customer_id || null,
      customer_name: doc.customer_name || null,
      document_description: doc.document_description || null,
      payment_method: paymentMethodMap.get(doc.id) || null,
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
