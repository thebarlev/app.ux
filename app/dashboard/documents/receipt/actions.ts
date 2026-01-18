"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  getCompanyIdForUser, 
  isSequenceLocked, 
  finalizeDocument,
  getNextDocumentNumberPreview 
} from "@/lib/document-helpers";
import { redirect } from "next/navigation";
import type { 
  PaymentRow, 
  PaymentMethod, 
  ReceiptDraftPayload, 
  ReceiptSettings
} from "@/lib/types/receipt";
import { paymentRowToLineItem as convertPayment } from "@/lib/types/receipt";
import { headers } from "next/headers";
import { isDigitalSignaturesEnabled, DIGITAL_SIGNATURES_DEFERRED_MESSAGE } from "@/lib/documents/signing/feature-flags";

// Re-export types for backward compatibility
export type { PaymentRow, PaymentMethod, ReceiptDraftPayload, ReceiptSettings };

type RecipientConsentStatus =
  | { ok: true; hasConsent: boolean; recipientIdentifier: string; consentGivenAt: string | null; consentRevokedAt: string | null }
  | { ok: false; message: string };

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return null;
}

async function resolveRecipientIdentifier(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  customerId: string | null;
  customerName: string;
  companyId: string;
}): Promise<{ ok: true; recipientIdentifier: string } | { ok: false; message: string }> {
  const { supabase, customerId, customerName } = params;

  if (!customerId) {
    return {
      ok: false,
      message:
        "נדרשת הסכמת מקבל למסמך ממוחשב, אבל לא נבחר לקוח שמור. בחר לקוח עם אימייל/טלפון/ת.ז (לא רק 'שם למסמך זה').",
    };
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("email, phone, mobile, tax_id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) {
    return {
      ok: false,
      message:
        "לא ניתן לאמת הסכמת מקבל: הלקוח לא נמצא או שאין הרשאה. נסה לרענן או לבחור לקוח אחר.",
    };
  }

  const recipientIdentifier =
    firstNonEmpty(customer.email, customer.phone, customer.mobile, customer.tax_id) ||
    null;

  if (!recipientIdentifier) {
    return {
      ok: false,
      message: `נדרשת הסכמה למסמך ממוחשב, אך ללקוח "${customer.name || customerName}" אין אימייל/טלפון/ת.ז. עדכן את הלקוח והפק מחדש.`,
    };
  }

  return { ok: true, recipientIdentifier };
}

async function getConsentRow(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  recipientIdentifier: string;
}) {
  const { supabase, companyId, recipientIdentifier } = params;
  return await supabase
    .from("recipient_consents")
    .select("consent_given_at, consent_revoked_at")
    .eq("company_id", companyId)
    .eq("recipient_identifier", recipientIdentifier)
    .maybeSingle();
}

export async function getRecipientConsentStatusAction(customerId: string | null, customerName: string): Promise<RecipientConsentStatus> {
  // TEMP: consent enforcement is deferred
  if (!isDigitalSignaturesEnabled()) {
    return { ok: false, message: DIGITAL_SIGNATURES_DEFERRED_MESSAGE };
  }
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const resolved = await resolveRecipientIdentifier({ supabase, customerId, customerName, companyId });
    if (!resolved.ok) return { ok: false, message: resolved.message };

    const { data, error } = await getConsentRow({
      supabase,
      companyId,
      recipientIdentifier: resolved.recipientIdentifier,
    });

    if (error) {
      // Likely missing table before migration applied
      return { ok: false, message: error.message };
    }

    const givenAt = data?.consent_given_at ? String(data.consent_given_at) : null;
    const revokedAt = data?.consent_revoked_at ? String(data.consent_revoked_at) : null;
    const hasConsent = !!givenAt && !revokedAt;

    return {
      ok: true,
      hasConsent,
      recipientIdentifier: resolved.recipientIdentifier,
      consentGivenAt: givenAt,
      consentRevokedAt: revokedAt,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export async function giveRecipientConsentAction(customerId: string | null, customerName: string): Promise<{ ok: true; recipientIdentifier: string } | { ok: false; message: string }> {
  // TEMP: consent enforcement is deferred
  if (!isDigitalSignaturesEnabled()) {
    return { ok: false, message: DIGITAL_SIGNATURES_DEFERRED_MESSAGE };
  }
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id || null;

    const resolved = await resolveRecipientIdentifier({ supabase, customerId, customerName, companyId });
    if (!resolved.ok) return { ok: false, message: resolved.message };

    const h = await headers();
    const xff = h.get("x-forwarded-for") || "";
    const ip = xff.split(",")[0]?.trim() || null;
    const ua = h.get("user-agent") || null;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("recipient_consents")
      .upsert(
        {
          company_id: companyId,
          recipient_identifier: resolved.recipientIdentifier,
          consent_given_at: now,
          consent_revoked_at: null,
          method: "checkbox",
          created_by_user_id: userId,
          ip_address: ip,
          user_agent: ua,
        },
        { onConflict: "company_id,recipient_identifier" }
      );

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, recipientIdentifier: resolved.recipientIdentifier };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export async function revokeRecipientConsentAction(customerId: string | null, customerName: string): Promise<{ ok: true } | { ok: false; message: string }> {
  // TEMP: consent enforcement is deferred
  if (!isDigitalSignaturesEnabled()) {
    return { ok: false, message: DIGITAL_SIGNATURES_DEFERRED_MESSAGE };
  }
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const resolved = await resolveRecipientIdentifier({ supabase, customerId, customerName, companyId });
    if (!resolved.ok) return { ok: false, message: resolved.message };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("recipient_consents")
      .update({ consent_revoked_at: now })
      .eq("company_id", companyId)
      .eq("recipient_identifier", resolved.recipientIdentifier);

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export type InitialReceiptCreateData =
  | {
      ok: true;
      companyId: string;
      companyName: string | null;
      sequenceLocked: boolean;
      previewNumber: string | null; // The formatted preview number (e.g., "000042")
      settings: ReceiptSettings;
      minAllowedDate: string | null; // Earliest allowed date (YYYY-MM-DD) based on last issued document
    }
  | {
      ok: false;
      message: string;
    };

/**
 * Get minimum allowed date for new receipts
 * Returns the latest issue_date of finalized receipts for this company
 * Returns null if no finalized receipts exist (no restriction)
 */
async function getMinAllowedDate(companyId: string, documentType: string): Promise<string | null> {
  const supabase = await createClient();  
  const { data, error } = await supabase
    .from("documents")
    .select("issue_date")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("document_status", "final")
    .order("issue_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {    return null;
  }
  
  const result = data.issue_date; // YYYY-MM-DD format  
  return result;
}

export async function getInitialReceiptCreateData(): Promise<InitialReceiptCreateData> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Check if sequence is locked
    const { locked } = await isSequenceLocked({ companyId, documentType: "receipt" });

    // Get preview of next document number (does NOT allocate it)
    const { formatted: previewNumber } = await getNextDocumentNumberPreview(
      companyId,
      "receipt"
    );

    // Get minimum allowed date (latest finalized receipt date)
    const minAllowedDate = await getMinAllowedDate(companyId, "receipt");

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
      minAllowedDate, // Pass min date restriction
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

// PaymentMethod type now imported from @/lib/types/receipt

// PaymentRow type now imported from @/lib/types/receipt

// ReceiptDraftPayload type now imported from @/lib/types/receipt

function validatePayload(p: ReceiptDraftPayload, minAllowedDate?: string | null) {  
  if (!p.customerName.trim()) return "חובה למלא שם לקוח.";
  if (!p.documentDate) return "חובה לבחור תאריך.";
  
  // Enforce date locking: document date cannot be earlier than last issued document
  if (minAllowedDate && p.documentDate < minAllowedDate) {    // Format date for display (DD/MM/YYYY)
    const formatDateForDisplay = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    };
    return `תאריך המסמך חייב להיות ${formatDateForDisplay(minAllowedDate)} או מאוחר יותר. המסמך האחרון הונפק ב-${formatDateForDisplay(minAllowedDate)}.`;
  }  
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
  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();
  
  // Get min allowed date for validation
  const minAllowedDate = await getMinAllowedDate(companyId, "receipt");
  const err = validatePayload(payload, minAllowedDate);
  if (err) return { ok: false as const, message: err };

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
      language: payload.language,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST204" && String(error.message || "").includes("language")) {
      return {
        ok: false as const,
        message:
          "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
      };
    }
    return { ok: false as const, message: error.message };
  }

  // Insert payment line items with metadata support
  if (payload.payments && payload.payments.length > 0) {
    const lineItems = payload.payments.map((payment, idx) => 
      convertPayment(payment, data.id, companyId, idx + 1)
    );

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
  console.log("[FINALIZE_RECEIPT] issueReceiptAction entry", { 
    documentDate: payload.documentDate,
    customerName: payload.customerName?.substring(0, 30),
    total: payload.total,
    paymentsCount: payload.payments?.length,
    payloadKeys: Object.keys(payload)
  });
  
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();    
    // Get min allowed date for validation
    const minAllowedDate = await getMinAllowedDate(companyId, "receipt");
    console.log("[FINALIZE_RECEIPT] Got minAllowedDate", { minAllowedDate });
    
    const err = validatePayload(payload, minAllowedDate);
    console.log("[FINALIZE_RECEIPT] Validation result", { hasError: !!err, error: err });
    
    if (err) {
      console.error("[FINALIZE_RECEIPT] Validation failed", { error: err });      
      // Ensure the error message is a string and properly serializable
      const errorMessage = typeof err === 'string' ? err : String(err) || "שגיאת ולידציה";
      const errorResponse = { ok: false as const, message: errorMessage };      
      console.log("[FINALIZE_RECEIPT] Returning validation error response", errorResponse);
      return errorResponse;
    }

    // TEMP: consent enforcement is deferred (do not touch recipient_consents / consent events)
    const shouldEnforceConsent = isDigitalSignaturesEnabled();
    const resolvedRecipient = shouldEnforceConsent
      ? await resolveRecipientIdentifier({
          supabase,
          customerId: payload.customerId || null,
          customerName: payload.customerName,
          companyId,
        })
      : null;
    if (shouldEnforceConsent && resolvedRecipient && !resolvedRecipient.ok) {
      return { ok: false as const, message: resolvedRecipient.message };
    }

    if (shouldEnforceConsent && resolvedRecipient && resolvedRecipient.ok) {
      const { data: consentData, error: consentError } = await getConsentRow({
        supabase,
        companyId,
        recipientIdentifier: resolvedRecipient.recipientIdentifier,
      });

      if (consentError) {
        return {
          ok: false as const,
          message:
            "שגיאה בבדיקת הסכמת מקבל: חסרה טבלת `recipient_consents` או אין הרשאה. נא להריץ scripts/030-recipient-consents.sql ואז לנסות שוב.",
        };
      }

      const hasActiveConsent = !!consentData?.consent_given_at && !consentData?.consent_revoked_at;
      if (!hasActiveConsent) {
        return {
          ok: false as const,
          message:
            "נדרשת הסכמת מקבל למסמך ממוחשב לפני הפקה. סמן/י הסכמה בחלון האישור ואז נסה/י שוב.",
        };
      }
    }

    // First create as draft (no number yet)
    console.log("[FINALIZE_RECEIPT] Creating draft document", {
      companyId: companyId?.substring(0, 8),
      customerName: payload.customerName?.substring(0, 30),
      documentDate: payload.documentDate,
      total: payload.total
    });
    
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
        language: payload.language,
      })
      .select("id")
      .single();

    if (draftError) {
      console.error("[FINALIZE_RECEIPT] Draft creation failed", { 
        error: draftError.message,
        code: draftError.code,
        details: draftError.details,
        hint: draftError.hint
      });
      if (draftError.code === "PGRST204" && String(draftError.message || "").includes("language")) {
        return {
          ok: false as const,
          message:
            "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
        };
      }
      return { ok: false as const, message: draftError.message || "Failed to create draft document" };
    }
    
    console.log("[FINALIZE_RECEIPT] Draft created", { draftId: draft.id });

    // TODO (deferred): record consent evidence to document_events when digital signatures rollout is enabled.
    // Intentionally skipped while DIGITAL_SIGNATURES_ENABLED is false.

    // Insert payment line items with metadata support
    if (payload.payments && payload.payments.length > 0) {
      console.log("[FINALIZE_RECEIPT] Inserting payment line items", { count: payload.payments.length });
      const lineItems = payload.payments.map((payment, idx) => 
        convertPayment(payment, draft.id, companyId, idx + 1)
      );

      const { error: lineItemsError } = await supabase
        .from("document_line_items")
        .insert(lineItems);

      if (lineItemsError) {
        console.error("[FINALIZE_RECEIPT] Failed to insert line items", { 
          error: lineItemsError.message,
          code: lineItemsError.code
        });
        // Continue anyway - will finalize document
      } else {
        console.log("[FINALIZE_RECEIPT] Line items inserted successfully");
      }
    }

    // Then finalize it (THIS is where the number gets allocated)
    // This also generates the PDF automatically (regulatory requirement)
    console.log("[FINALIZE_RECEIPT] Calling finalizeDocument", { draftId: draft.id, companyId: companyId?.substring(0, 8) });    
    const result = await finalizeDocument(draft.id, companyId, "receipt");    
    console.log("[FINALIZE_RECEIPT] finalizeDocument result", { 
      ok: result.ok, 
      documentNumber: result.documentNumber,
      message: result.message 
    });

    if (!result.ok) {
      console.error("[FINALIZE_RECEIPT] finalizeDocument failed", { 
        message: result.message,
        draftId: draft.id
      });
      const errorResponse = {
        ok: false as const,
        message: result.message ?? "Failed to finalize document",
      };      return errorResponse;
    }

    // PDF is generated automatically in finalizeDocument
    // No need to call generateDocumentPDF again here

    // Get company name for preview
    console.log("[FINALIZE_RECEIPT] Fetching company name", { companyId: companyId?.substring(0, 8) });
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .single();

    if (companyError) {
      console.error("[FINALIZE_RECEIPT] Failed to fetch company", { error: companyError.message });
    }

    console.log("[FINALIZE_RECEIPT] issueReceiptAction success", {
      receiptId: draft.id,
      documentNumber: result.documentNumber,
      companyName: company?.company_name
    });

    // Return the receipt data for preview
    return {
      ok: true as const,
      receiptId: draft.id,
      documentNumber: result.documentNumber,
      companyName: company?.company_name || "העסק שלי",
      payload, // Return original payload for preview
    };
  } catch (error: any) {
    // Handle all error types - Next.js server actions can throw various error types
    const errorMessage = error?.message || error?.toString() || String(error) || "שגיאה בלתי צפויה בהפקת המסמך";
    const errorType = error?.constructor?.name || typeof error;
    const errorStack = error?.stack || "No stack trace";
    const errorName = error?.name || "Unknown";
    const errorCode = error?.code || error?.statusCode || null;
    
    console.error("[FINALIZE_RECEIPT] Exception in issueReceiptAction", {
      error: errorMessage,
      errorType,
      errorName,
      errorCode,
      stack: errorStack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });    
    return {
      ok: false as const,
      message: errorMessage,
    };
  }
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
      language: payload.language,
    })
    .eq("id", draftId)
    .eq("company_id", companyId); // Double-check company_id for security

  if (updateError) {
    if (updateError.code === "PGRST204" && String(updateError.message || "").includes("language")) {
      return {
        ok: false as const,
        message:
          "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
      };
    }
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

/**
 * Build preview URL for a receipt by ID
 * Fetches receipt data and constructs URL for preview page
 *
 * NOTE: This is used by multiple places (documents list, receipt create flow, receipt summary),
 * and must not depend on the removed `/dashboard/documents/receipts` route.
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
      documentId: receiptId,
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
