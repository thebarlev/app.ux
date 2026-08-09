"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser, initializeSequence, isSequenceLocked } from "@/lib/document-helpers";

// ── CREDIT NOTE BLOCKED ───────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which is
// exactly the failure mode fixed in S1.3, so the values are literals here.
//
// Scoped deliberately to the three credit document types, in BOTH the app-level
// camelCase spelling used by the caller and the snake_case spelling used by the
// database. Nothing else in this file changes, and no other document type is
// affected. To restore credit-note issuance, revert the
// security/credit-note-block commits.
const CREDIT_NOTE_SEQUENCE_BLOCKED_TYPES: ReadonlySet<string> = new Set([
  "creditNote",
  "credit_note",
  "selfCreditNote",
  "self_credit_note",
  "credit_invoice",
]);

export type DocumentsListFilters = {
  search?: string;
  documentType?: string;
  /**
   * Optional filter by document_status.
   * - "draft": only drafts
   * - "nonDraft": everything except drafts
   * - "all": no filtering (default)
   */
  documentStatusFilter?: "all" | "draft" | "nonDraft";
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
  accounting_status?: string | null;
  paid_amount?: number | null;
  credited_amount?: number | null;
  outstanding_balance?: number | null;
  reference_text?: string | null;
  /**
   * UI-only derived flags (no DB schema changes).
   * Used to compute the 4-status UI mapping deterministically.
   */
  has_outgoing_credit_link?: boolean;
  credited_by_credit_amount?: number | null;
  is_canceled_by_credit?: boolean;
  created_at: string;
};

export type DocumentsListResult = {
  companyId: string;
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
          companyId: "",
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
      documentStatusFilter = "all",
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
        finalized_at,
        updated_at,
        customer_id,
        customer_name,
        document_description,
        total_amount,
        currency,
        document_status,
        accounting_status,
        paid_amount,
        credited_amount,
        outstanding_balance,
        reference_text,
        company_id
      `, { count: "exact" })
      .eq("company_id", companyId);

    // Document status filter
    if (documentStatusFilter === "draft") {
      query = query.eq("document_status", "draft");
    } else if (documentStatusFilter === "nonDraft") {
      // Include documents where status != 'draft' OR status is null (e.g. auditor-issued invoices)
      query = query.or("document_status.neq.draft,document_status.is.null");
    }

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

    // Sorting: newest first by *finalization time*.
    // Why: a document may be finalized from an older draft (created_at old), but the UX expects
    // the last-issued document to appear first. finalized_at is set on issuance.
    // Fallback: created_at for rows missing finalized_at (older legacy rows).
    query = query
      .order("finalized_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

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

    const toFiniteNumberOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Transform to DocumentListItem format
    const items: DocumentListItem[] = (documents || []).map((doc) => ({
      // NOTE: Supabase may return numeric/decimal columns as strings.
      id: doc.id,
      document_number: doc.document_number,
      document_type: doc.document_type,
      document_date: doc.issue_date || doc.created_at,
      customer_id: doc.customer_id || null,
      customer_name: doc.customer_name || null,
      document_description: doc.document_description || null,
      payment_method: paymentMethodMap.get(doc.id) || null,
      total_amount: toFiniteNumberOrNull((doc as any).total_amount),
      currency: doc.currency || "ILS",
      document_status: doc.document_status,
      accounting_status: (doc as any).accounting_status ?? null,
      paid_amount: toFiniteNumberOrNull((doc as any).paid_amount),
      credited_amount: toFiniteNumberOrNull((doc as any).credited_amount),
      outstanding_balance: toFiniteNumberOrNull((doc as any).outstanding_balance),
      reference_text: (doc as any).reference_text ?? null,
      has_outgoing_credit_link: false,
      credited_by_credit_amount: null,
      is_canceled_by_credit: false,
      created_at: doc.created_at,
    }));

    // UI-only flags: credit links (source/target) for the current page
    const ids = items.map((it) => it.id);
    if (ids.length > 0) {
      // Outgoing credit links: source_document_id in ids
      const { data: outgoingCredits, error: outgoingErr } = await supabase
        .from("document_links")
        .select("source_document_id")
        .eq("company_id", companyId)
        .in("link_type", ["credit", "cancellation"])
        .in("source_document_id", ids);

      if (outgoingErr) {
        console.warn("[getAllDocumentsListAction] outgoing credit links query failed:", outgoingErr.message);
      }

      const outgoingSet = new Set<string>((outgoingCredits || []).map((r: any) => String(r.source_document_id)));

      // Incoming credit sum: target_document_id in ids
      const { data: incomingCredits, error: incomingErr } = await supabase
        .from("document_links")
        .select("target_document_id, amount")
        .eq("company_id", companyId)
        .in("link_type", ["credit", "cancellation"])
        .in("target_document_id", ids);

      if (incomingErr) {
        console.warn("[getAllDocumentsListAction] incoming credit links query failed:", incomingErr.message);
      }

      const incomingSum = new Map<string, number>();
      for (const row of incomingCredits || []) {
        const id = String((row as any).target_document_id);
        const amount = typeof (row as any).amount === "number" ? (row as any).amount : Number((row as any).amount || 0);
        incomingSum.set(id, (incomingSum.get(id) || 0) + (Number.isFinite(amount) ? amount : 0));
      }

      for (const it of items) {
        const sum = incomingSum.get(it.id) ?? 0;
        const total = typeof it.total_amount === "number" ? it.total_amount : null;
        it.has_outgoing_credit_link = outgoingSet.has(it.id);
        it.credited_by_credit_amount = Number.isFinite(sum) ? Number(sum.toFixed(2)) : null;
        it.is_canceled_by_credit = !!(total && total > 0 && sum >= total);
      }
    }

    return {
      ok: true,
      data: {
        companyId,
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
  // CREDIT NOTE BLOCKED — first statement executed, and scoped to credit types ONLY.
  //
  // Why this is blocked in the action and not only in the screen: initializeSequence
  // inserts the row with is_locked = true (lib/document-helpers.ts:111-121), and
  // since migration 118 removed the permissive duplicate policy that guard is
  // actually enforced. So one click permanently fixes the starting number of the
  // credit-note sequence — before the accountant has decided what it should be —
  // and initializeSequence itself then refuses to change it
  // (returns "sequence_already_locked"). That is an irreversible database change,
  // so it is stopped at the action.
  //
  // Both spellings are listed on purpose. The modal passes the app-level camelCase
  // type (CreditNoteFormClient.tsx:1377 sends "creditNote"), while the database
  // types are snake_case and the normalisation happens later inside
  // initializeSequence via a helper that is not exported. Matching only the
  // snake_case forms would make this guard a no-op.
  //
  // Every other document type — invoice, invoiceReceipt, receipt, tax_invoice and
  // the rest — falls through untouched, with identical behaviour to before.
  if (CREDIT_NOTE_SEQUENCE_BLOCKED_TYPES.has(params.documentType)) {
    return { ok: false as const, message: "הפקת חשבונית זיכוי אינה זמינה כרגע" };
  }

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
