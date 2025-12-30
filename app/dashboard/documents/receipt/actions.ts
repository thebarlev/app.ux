"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  getCompanyIdForUser, 
  isSequenceLocked, 
  finalizeDocument,
  getNextDocumentNumberPreview 
} from "@/lib/document-helpers";
import { redirect } from "next/navigation";

export type ReceiptSettings = {
  allowedCurrencies: string[];
  defaultCurrency: string;
  language: "he" | "en";
  roundTotals: boolean;
};

export type InitialReceiptCreateData =
  | {
      ok: true;
      companyId: string;
      companyName: string | null;
      sequenceLocked: boolean;
      previewNumber: string | null; // The formatted preview number (e.g., "000042")
      settings: ReceiptSettings;
    }
  | {
      ok: false;
      message: string;
    };

export async function getInitialReceiptCreateData(): Promise<InitialReceiptCreateData> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Check if sequence is locked
    const { locked } = await isSequenceLocked(companyId, "receipt");

    // Get preview of next document number (does NOT allocate it)
    const { formatted: previewNumber } = await getNextDocumentNumberPreview(
      companyId,
      "receipt"
    );

    // Get company name
    let companyName: string | null = null;
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();
    companyName = company?.company_name ?? null;

    // Default settings
    const settings: ReceiptSettings = {
      allowedCurrencies: ["₪", "$", "€"],
      defaultCurrency: "₪",
      language: "he",
      roundTotals: false,
    };

    return {
      ok: true,
      companyId,
      companyName,
      sequenceLocked: locked,
      previewNumber, // Pass preview to client
      settings,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export type PaymentMethod =
  | "העברה בנקאית"
  | "Bit"
  | "PayBox"
  | "כרטיס אשראי"
  | "מזומן"
  | "צ׳ק"
  | "PayPal"
  | "Payoneer"
  | "Google Pay"
  | "Apple Pay"
  | "ביטקוין"
  | "אתריום"
  | "שובר BuyME"
  | "שובר מתנה"
  | "שווה כסף"
  | "V-CHECK"
  | "Colu"
  | "ניכוי במקור"
  | "ניכוי חלק עובד טל״א"
  | "ניכוי אחר";

export type PaymentRow = {
  method: PaymentMethod | "";
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
};

export type ReceiptDraftPayload = {
  documentType: "receipt";
  customerName: string;
  customerId?: string | null; // NEW: Link to customer record
  documentDate: string;
  description: string;
  payments: PaymentRow[];
  notes: string;
  footerNotes: string;
  currency: string;
  total: number;
  roundTotals: boolean;
  language: "he" | "en";
};

function validatePayload(p: ReceiptDraftPayload) {
  if (!p.customerName.trim()) return "חובה למלא שם לקוח.";
  if (!p.documentDate) return "חובה לבחור תאריך.";
  if (!Array.isArray(p.payments) || p.payments.length === 0) return "חובה להוסיף לפחות תקבול אחד.";
  for (const [i, row] of p.payments.entries()) {
    if (!row.method) return `שורת תקבול ${i + 1}: חובה לבחור אמצעי תשלום.`;
    if (!row.date) return `שורת תקבול ${i + 1}: חובה לבחור תאריך.`;
    if (!Number.isFinite(row.amount) || row.amount <= 0) return `שורת תקבול ${i + 1}: סכום חייב להיות גדול מ-0.`;
    if (!row.currency) return `שורת תקבול ${i + 1}: חובה לבחור מטבע.`;
  }
  return null;
}

/**
 * Save receipt as draft (no document number assigned)
 * CRITICAL: This NEVER allocates a document number
 * The preview number is NOT consumed when saving as draft
 */
export async function saveReceiptDraftAction(payload: ReceiptDraftPayload) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "receipt",
      document_status: "draft", // Always draft
      document_number: null, // NEVER set a number for drafts
      customer_id: payload.customerId || null, // Link to customer
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      document_description: payload.description || null, // Receipt description
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      customer_notes: payload.footerNotes,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, message: error.message };

  // Insert payment line items
  if (payload.payments && payload.payments.length > 0) {
    const lineItems = payload.payments.map((payment, idx) => ({
      document_id: data.id,
      company_id: companyId,
      line_number: idx + 1,
      description: payment.method,
      item_date: payment.date, // Save individual payment date
      quantity: 1,
      unit_price: payment.amount,
      line_total: payment.amount,
      currency: payment.currency,
      bank_name: payment.bankName || null,
      branch: payment.branch || null,
      account_number: payment.accountNumber || null,
    }));

    const { error: lineItemsError } = await supabase
      .from("document_line_items")
      .insert(lineItems);

    if (lineItemsError) {
      console.error("Failed to insert line items:", lineItemsError);
      // Continue anyway - document is saved
    }
  }
  
  return { ok: true as const, draftId: data.id };
}

/**
 * Issue receipt immediately with document number
 * This is the ONLY action that allocates document numbers
 * Creates document as draft, then finalizes it (which allocates the number)
 * Returns the receipt ID instead of redirecting (for PDF download)
 */
export async function issueReceiptAction(payload: ReceiptDraftPayload) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  // First create as draft (no number yet)
  const { data: draft, error: draftError } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "receipt",
      document_status: "draft",
      document_number: null, // No number until finalized
      customer_id: payload.customerId || null,
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      document_description: payload.description || null, // Receipt description
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      customer_notes: payload.footerNotes,
    })
    .select("id")
    .single();

  if (draftError) return { ok: false as const, message: draftError.message };

  // Insert payment line items
  if (payload.payments && payload.payments.length > 0) {
    const lineItems = payload.payments.map((payment, idx) => ({
      document_id: draft.id,
      company_id: companyId,
      line_number: idx + 1,
      description: payment.method,
      item_date: payment.date, // Save individual payment date
      quantity: 1,
      unit_price: payment.amount,
      line_total: payment.amount,
      currency: payment.currency,
      bank_name: payment.bankName || null,
      branch: payment.branch || null,
      account_number: payment.accountNumber || null,
    }));

    const { error: lineItemsError } = await supabase
      .from("document_line_items")
      .insert(lineItems);

    if (lineItemsError) {
      console.error("Failed to insert line items:", lineItemsError);
      // Continue anyway - will finalize document
    }
  }

  // Then finalize it (THIS is where the number gets allocated)
  const result = await finalizeDocument(draft.id, companyId, "receipt");

  if (!result.ok) {
    return {
      ok: false as const,
      message: result.message ?? "Failed to finalize document",
    };
  }

  // Get company name for preview
  const { data: company } = await supabase
    .from("companies")
    .select("company_name")
    .eq("id", companyId)
    .single();

  // Return the receipt data for preview
  return {
    ok: true as const,
    receiptId: draft.id,
    documentNumber: result.documentNumber,
    companyName: company?.company_name || "העסק שלי",
    payload, // Return original payload for preview
  };
}

/**
 * Update an existing draft receipt
 * CRITICAL: This will FAIL if the document is already final (enforced by RLS)
 */
export async function updateReceiptDraftAction(draftId: string, payload: ReceiptDraftPayload) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  // First verify this is a draft and belongs to the user's company
  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("id, document_status")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_type", "receipt")
    .maybeSingle();

  if (fetchError) return { ok: false as const, message: fetchError.message };
  if (!existing) return { ok: false as const, message: "Draft not found" };

  // Server-side guard: Prevent editing final receipts
  if (existing.document_status !== "draft") {
    return {
      ok: false as const,
      message: "Cannot edit final receipts. Only drafts can be modified.",
    };
  }

  // Update the draft
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      customer_notes: payload.footerNotes,
    })
    .eq("id", draftId)
    .eq("company_id", companyId); // Double-check company_id for security

  if (updateError) {
    // RLS will also block this if status is not 'draft'
    return { ok: false as const, message: updateError.message };
  }

  return { ok: true as const };
}

/**
 * Get draft receipt for editing
 * Returns error if document is final or doesn't exist
 */
export async function getDraftReceiptForEditAction(draftId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("document_type", "receipt")
      .maybeSingle();

    if (error) return { ok: false as const, message: error.message };
    if (!data) return { ok: false as const, message: "Draft not found" };

    // Server-side guard: Prevent editing final receipts
    if (data.document_status !== "draft") {
      return {
        ok: false as const,
        message: "Cannot edit final receipts. Only drafts can be modified.",
      };
    }

    return {
      ok: true as const,
      draft: {
        id: data.id,
        customerName: data.customer_name ?? "",
        documentDate: data.issue_date ?? todayYmd(),
        total: data.total_amount ?? 0,
        currency: data.currency ?? "₪",
        notes: data.internal_notes ?? "",
        footerNotes: data.customer_notes ?? "",
      },
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
