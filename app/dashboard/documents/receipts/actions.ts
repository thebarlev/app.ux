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
  status?: "all" | "draft" | "final" | "void";
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

    // Build query
    let query = supabase
      .from("documents")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .eq("document_type", "receipt");

    // Status filter
    if (status !== "all") {
      query = query.eq("document_status", status);
    }

    // Search filter (document_number, customer_name, description)
    if (search && search.trim()) {
      query = query.or(
        `document_number.ilike.%${search}%,customer_name.ilike.%${search}%,internal_notes.ilike.%${search}%,customer_notes.ilike.%${search}%`
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

    // Sorting: final receipts by document_number desc, drafts by created_at desc
    query = query.order("document_status", { ascending: true }); // drafts first
    query = query.order("document_number", { ascending: false, nullsFirst: true });
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
    const items: ReceiptListItem[] = (receipts || []).map((doc) => ({
      id: doc.id,
      document_number: doc.document_number,
      document_date: doc.issue_date,
      customer_name: doc.customer_name || "—",
      description: doc.internal_notes || doc.customer_notes || null,
      amount: doc.total_amount || 0,
      currency: doc.currency || "ILS",
      status: doc.document_status as ReceiptStatus,
      created_at: doc.created_at,
    }));

    return {
      ok: true,
      data: {
        receipts: items,
        totalCount: count || 0,
        page,
        pageSize,
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
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return { ok: true, csv: csvContent };
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

    // Fetch line items (payments)
    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("description, item_date, unit_price, line_total, currency, bank_name, branch, account_number")
      .eq("document_id", receiptId)
      .order("line_number");

    // Build payments array
    const payments = (lineItems || []).map((item: any) => ({
      method: item.description || "תשלום",
      date: item.item_date || receipt.issue_date || new Date().toISOString().split("T")[0],
      amount: item.line_total || 0,
      currency: item.currency || receipt.currency || "₪",
      bankName: item.bank_name || undefined,
      branch: item.branch || undefined,
      accountNumber: item.account_number || undefined,
    }));

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
    });

    const url = `/dashboard/documents/receipt/preview?${params.toString()}`;
    
    return { ok: true, url };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to build preview URL" };
  }
}
