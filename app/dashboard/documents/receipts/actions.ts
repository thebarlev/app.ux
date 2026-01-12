"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";

export type ReceiptStatus = "draft" | "final" | "void" | "cancelled";

export type ReceiptListItem = {
  id: string;
  document_number: string | null;
  document_date: string | null;
  customer_name: string;
  description: string | null;
  amount: number;
  currency: string;
  status: ReceiptStatus;
  created_at: string;
};

export type ReceiptsListFilters = {
  search?: string;
  status?: "all" | "non_draft" | "draft" | "final" | "void";
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
};

export type ReceiptsListResult = {
  receipts: ReceiptListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  draftCount: number;
};

/**
 * Fetch receipts for the current user's company with filters
 * Always scoped to company_id and document_type = 'receipt'
 */
export async function getReceiptsListAction(
  filters: ReceiptsListFilters = {}
): Promise<{ ok: boolean; data?: ReceiptsListResult; message?: string }> {
  try {
    const supabase = await createClient();
    
    // Get company ID - if this fails, return empty list instead of error
    let companyId: string;
    try {
      companyId = await getCompanyIdForUser();
    } catch (e: any) {
      console.error("Failed to get company ID:", e);
      return {
        ok: true,
        data: {
          receipts: [],
          totalCount: 0,
          page: 1,
          pageSize: 50,
          draftCount: 0,
        },
      };
    }

    const {
      search = "",
      status = "all",
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      page = 1,
      pageSize = 50,
    } = filters;

    // For the Drafts tab badge: count drafts for this company (not affected by filters).
    let draftCount = 0;
    try {
      const { count, error } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("document_type", "receipt")
        .eq("document_status", "draft");
      if (!error) draftCount = count || 0;
    } catch {
      // Ignore draftCount failures; the list itself should still render.
      draftCount = 0;
    }

    const clip80 = (s: string) => {
      const t = s.trim()
      if (t.length <= 80) return t
      return `${t.slice(0, 80)}…`
    }

    const summarizeParts = (parts: string[]) => {
      const clean = parts.map((p) => String(p || "").trim()).filter(Boolean)
      const uniq: string[] = []
      for (const p of clean) {
        if (!uniq.includes(p)) uniq.push(p)
      }
      if (uniq.length === 0) return null
      if (uniq.length <= 2) return uniq.join(", ")
      return `${uniq.slice(0, 2).join(", ")} …+${uniq.length - 2}`
    }

    // Build query (server-side ordering for correct pagination)
    let query = supabase
      .from("documents")
      .select(
        `
          id,
          document_number,
          issue_date,
          customer_name,
          document_description,
          internal_notes,
          customer_notes,
          total_amount,
          currency,
          document_status,
          created_at,
          document_line_items(description, payment_metadata)
        `,
        { count: "exact" }
      )
      .eq("company_id", companyId)
      .eq("document_type", "receipt");

    // Status filter
    if (status === "non_draft") {
      query = query.neq("document_status", "draft");
    } else if (status !== "all") {
      query = query.eq("document_status", status);
    }

    // Search filter (document_number, customer_name, description/notes)
    if (search && search.trim()) {
      query = query.or(
        `document_number.ilike.%${search}%,customer_name.ilike.%${search}%,document_description.ilike.%${search}%,internal_notes.ilike.%${search}%,customer_notes.ilike.%${search}%`
      );
    }

    // Date range filter (using issue_date)
    if (dateFrom) {
      query = query.gte("issue_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("issue_date", dateTo);
    }

    // Amount range filter
    if (minAmount !== undefined) {
      query = query.gte("total_amount", minAmount);
    }
    if (maxAmount !== undefined) {
      query = query.lte("total_amount", maxAmount);
    }

    // Sorting: newest first
    // Prefer issue_date (for issued/final), else created_at.
    query = query.order("issue_date", { ascending: false, nullsFirst: false });
    query = query.order("created_at", { ascending: false });

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: receipts, error, count } = await query;

    if (error) {
      return { ok: false, message: error.message };
    }

    // Transform to ReceiptListItem format
    const items: ReceiptListItem[] = (receipts || []).map((doc: any) => {
      const primary = typeof doc.document_description === "string" ? doc.document_description.trim() : ""
      const notesCandidate =
        typeof doc.internal_notes === "string" && doc.internal_notes.trim()
          ? clip80(doc.internal_notes)
          : typeof doc.customer_notes === "string" && doc.customer_notes.trim()
            ? clip80(doc.customer_notes)
            : ""

      const lineItems = Array.isArray(doc.document_line_items) ? doc.document_line_items : []
      const lineParts = lineItems.flatMap((li: any) => {
        const a = typeof li?.description === "string" ? li.description : ""
        const b = typeof li?.payment_metadata?.description === "string" ? li.payment_metadata.description : ""
        return [a, b]
      })
      const lineSummary = summarizeParts(lineParts)

      const description =
        primary || notesCandidate || lineSummary || null

      return {
        id: doc.id,
        document_number: doc.document_number,
        document_date: doc.issue_date,
        customer_name: doc.customer_name || "—",
        description,
        amount: doc.total_amount || 0,
        currency: doc.currency || "ILS",
        status: doc.document_status as ReceiptStatus,
        created_at: doc.created_at,
      }
    });

    return {
      ok: true,
      data: {
        receipts: items,
        totalCount: count || 0,
        page,
        pageSize,
        draftCount,
      },
    };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to fetch receipts" };
  }
}

/**
 * Export receipts to CSV format
 * Returns CSV string with filtered receipts
 */
export async function exportReceiptsCSVAction(
  filters: ReceiptsListFilters = {}
): Promise<{ ok: boolean; csv?: string; message?: string }> {
  try {
    // Fetch all matching receipts (no pagination)
    const result = await getReceiptsListAction({
      ...filters,
      page: 1,
      pageSize: 10000, // Large number to get all
    });

    if (!result.ok || !result.data) {
      return { ok: false, message: result.message || "Failed to fetch receipts" };
    }

    const { receipts } = result.data;

    // Build CSV
    const headers = [
      "Receipt Number",
      "Date",
      "Customer",
      "Description",
      "Amount",
      "Currency",
      "Status",
    ];

    const rows = receipts.map((r) => [
      r.document_number || "—",
      r.document_date || "—",
      r.customer_name,
      r.description || "",
      r.amount.toString(),
      r.currency,
      r.status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => {
          // Escape quotes in CSV: double any existing quotes, then wrap in quotes
          const cellValue = String(cell).replace(/"/g, '""');
          return `"${cellValue}"`;
        }).join(",")
      ),
    ].join("\n");

    // Add UTF-8 BOM for proper Excel encoding (especially for Hebrew text)
    const csvWithBOM = "\uFEFF" + csvContent;

    return { ok: true, csv: csvWithBOM };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to export CSV" };
  }
}

/**
 * Build preview URL for a receipt by ID
 * Fetches all receipt data and constructs URL for new preview page
 */
export async function getReceiptPreviewUrlAction(receiptId: string): Promise<{
  ok: boolean;
  url?: string;
  message?: string;
}> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Fetch the receipt with company isolation
    const { data: receipt, error: receiptError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .eq("document_type", "receipt")
      .maybeSingle();

    if (receiptError || !receipt) {
      return { ok: false, message: "Receipt not found" };
    }

    // Fetch company info
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();

    // Fetch line items (payments) - include payment_metadata for all payment fields
    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("description, item_date, unit_price, line_total, currency, bank_name, branch, account_number, payment_metadata")
      .eq("document_id", receiptId)
      .order("line_number");

    // Build payments array - include ALL fields from payment_metadata
    const payments = (lineItems || []).map((item: any) => {
      const metadata = item.payment_metadata || {};
      
      return {
        method: item.description || "תשלום",
        date: item.item_date || receipt.issue_date || new Date().toISOString().split("T")[0],
        amount: item.line_total || 0,
        currency: item.currency || receipt.currency || "₪",
        // Bank transfer fields (direct columns + metadata)
        bankName: item.bank_name || metadata.bankName || undefined,
        branch: item.branch || metadata.bankBranch || metadata.branch || undefined,
        accountNumber: item.account_number || metadata.bankAccount || metadata.accountNumber || undefined,
        // Credit card fields (from metadata)
        cardLastDigits: metadata.cardLastDigits || undefined,
        cardType: metadata.cardType || undefined,
        cardDealType: metadata.cardDealType || undefined,
        cardInstallments: metadata.cardInstallments || undefined,
        // Check fields (from metadata)
        checkBank: metadata.checkBank || undefined,
        checkBranch: metadata.checkBranch || undefined,
        checkAccount: metadata.checkAccount || undefined,
        checkNumber: metadata.checkNumber || undefined,
        // Digital wallet fields (from metadata)
        payerAccount: metadata.payerAccount || undefined,
        transactionReference: metadata.transactionReference || undefined,
        // Other fields (from metadata)
        description: metadata.description || undefined,
        reference_number: metadata.reference_number || undefined,
        reference: metadata.reference || undefined,
        notes: metadata.notes || undefined,
      };
    });

    // Build preview URL query params
    const params = new URLSearchParams({
      previewNumber: receipt.document_number || "",
      companyName: company?.company_name || "העסק שלי",
      customerName: receipt.customer_name || "",
      customerId: receipt.customer_id || "",
      documentDate: receipt.issue_date || new Date().toISOString().split("T")[0],
      description: receipt.description || "",
      notes: receipt.internal_notes || "",
      footerNotes: receipt.customer_notes || "",
      total: receipt.total_amount?.toString() || "0",
      currency: receipt.currency || "₪",
      payments: JSON.stringify(payments),
      language: (receipt as any)?.language || "he",
    });

    const url = `/dashboard/documents/receipt/preview?${params.toString()}`;
    
    return { ok: true, url };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to build preview URL" };
  }
}
