"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getCompanyIdForUser,
  isSequenceLocked,
  finalizeDocument,
  getNextDocumentNumberPreview,
} from "@/lib/document-helpers";
import type {
  PaymentRow,
  PaymentMethod,
  ReceiptDraftPayload,
  ReceiptSettings,
} from "@/lib/types/receipt";
import { paymentRowToLineItem as convertPayment } from "@/lib/types/receipt";
import { headers } from "next/headers";
import {
  isDigitalSignaturesEnabled,
  DIGITAL_SIGNATURES_DEFERRED_MESSAGE,
} from "@/lib/documents/signing/feature-flags";

export type DocumentIssueType = "receipt" | "tax_invoice";

export type VatType = "regular" | "no_vat";

export type TaxInvoiceItemRow = {
  label: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  vatMode: "before" | "included";
  lineTotal: number;
};

export type DocumentDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: DocumentIssueType;
  items?: TaxInvoiceItemRow[];
  vatType?: VatType;
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
};

export type InitialDocumentCreateData =
  | {
      ok: true;
      companyId: string;
      companyName: string | null;
      sequenceLocked: boolean;
      previewNumber: string | null;
      settings: ReceiptSettings;
      minAllowedDate: string | null;
      vatRate?: number;
    }
  | {
      ok: false;
      message: string;
    };

const DOCUMENT_ROUTE_SEGMENTS: Record<DocumentIssueType, string> = {
  receipt: "receipt",
  "tax_invoice": "tax-invoice",
};

const DOCUMENT_TYPE_LABELS: Record<DocumentIssueType, string> = {
  receipt: "קבלה",
  "tax_invoice": "חשבונית מס",
};

// Re-export types for backward compatibility
export type { PaymentRow, PaymentMethod, ReceiptDraftPayload, ReceiptSettings };

type RecipientConsentStatus =
  | {
      ok: true;
      hasConsent: boolean;
      recipientIdentifier: string;
      consentGivenAt: string | null;
      consentRevokedAt: string | null;
    }
  | { ok: false; message: string };

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return null;
}

function getLogPrefix(documentType: DocumentIssueType) {
  if (documentType === "receipt") return "[FINALIZE_RECEIPT]";
  return `[FINALIZE_${documentType.toUpperCase()}]`;
}

function getDocumentTypeLabel(documentType: DocumentIssueType) {
  return DOCUMENT_TYPE_LABELS[documentType] || documentType;
}

function itemRowToLineItem(
  item: TaxInvoiceItemRow,
  documentId: string,
  companyId: string,
  lineNumber: number,
  issueDate: string
) {
  const metadata = {
    sku: item.sku || null,
    label: item.label || null,
    details: item.description || null,
    vatMode: item.vatMode || "before",
  };
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  const lineTotal = Number.isFinite(item.lineTotal) ? item.lineTotal : quantity * unitPrice;

  return {
    document_id: documentId,
    company_id: companyId,
    line_number: lineNumber,
    description: item.label || item.description || "פריט",
    item_date: issueDate,
    unit_price: unitPrice,
    quantity: quantity,
    line_total: lineTotal,
    currency: item.currency,
    bank_name: null,
    branch: null,
    account_number: null,
    payment_metadata: metadata,
  };
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
    firstNonEmpty(customer.email, customer.phone, customer.mobile, customer.tax_id) || null;

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

export async function getRecipientConsentStatusAction(
  customerId: string | null,
  customerName: string
): Promise<RecipientConsentStatus> {
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

export async function giveRecipientConsentAction(
  customerId: string | null,
  customerName: string
): Promise<{ ok: true; recipientIdentifier: string } | { ok: false; message: string }> {
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

export async function revokeRecipientConsentAction(
  customerId: string | null,
  customerName: string
): Promise<{ ok: true } | { ok: false; message: string }> {
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

async function getMinAllowedDate(companyId: string, documentType: DocumentIssueType): Promise<string | null> {
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
  if (error || !data) {
    return null;
  }

  const result = data.issue_date;
  return result;
}

export async function getInitialDocumentCreateData(
  documentType: DocumentIssueType
): Promise<InitialDocumentCreateData> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { locked } = await isSequenceLocked({ companyId, documentType });
    const { formatted: previewNumber } = await getNextDocumentNumberPreview(companyId, documentType);

    const minAllowedDate = await getMinAllowedDate(companyId, documentType);

    let companyName: string | null = null;
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();
    companyName = company?.company_name ?? null;

    const settings: ReceiptSettings = {
      allowedCurrencies: ["₪", "$", "€"],
      defaultCurrency: "₪",
      language: "he",
      roundTotals: false,
    };

    let vatRate: number | undefined = undefined;
    if (documentType === "tax_invoice") {
      const { data: vatSetting } = await supabase
        .from("global_settings")
        .select("setting_value")
        .eq("setting_key", "default_vat_rate")
        .maybeSingle();
      const parsed = Number(vatSetting?.setting_value);
      vatRate = Number.isFinite(parsed) ? parsed : 18;
    }

    return {
      ok: true,
      companyId,
      companyName,
      sequenceLocked: locked,
      previewNumber,
      settings,
      minAllowedDate,
      vatRate,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

function validatePayload(p: DocumentDraftPayload, minAllowedDate?: string | null) {
  if (!p.customerName.trim()) return "חובה למלא שם לקוח.";
  if (!p.documentDate) return "חובה לבחור תאריך.";

  if (minAllowedDate && p.documentDate < minAllowedDate) {
    const formatDateForDisplay = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-");
      return `${day}/${month}/${year}`;
    };
    return `תאריך המסמך חייב להיות ${formatDateForDisplay(minAllowedDate)} או מאוחר יותר. המסמך האחרון הונפק ב-${formatDateForDisplay(minAllowedDate)}.`;
  }
  if (p.documentType === "tax_invoice" && Array.isArray(p.items)) {
    if (p.items.length === 0) return "חובה להוסיף לפחות פריט אחד.";
    for (const [i, row] of p.items.entries()) {
      if (!row.description) return `שורת פריט ${i + 1}: חובה למלא פירוט.`;
      if (!Number.isFinite(row.quantity) || row.quantity <= 0)
        return `שורת פריט ${i + 1}: כמות חייבת להיות גדולה מ-0.`;
      if (!Number.isFinite(row.unitPrice) || row.unitPrice <= 0)
        return `שורת פריט ${i + 1}: מחיר ליחידה חייב להיות גדול מ-0.`;
      if (!row.currency) return `שורת פריט ${i + 1}: חובה לבחור מטבע.`;
    }
  } else {
    if (!Array.isArray(p.payments) || p.payments.length === 0)
      return "חובה להוסיף לפחות תקבול אחד.";
    for (const [i, row] of p.payments.entries()) {
      if (!row.method) return `שורת תקבול ${i + 1}: חובה לבחור אמצעי תשלום.`;
      if (!row.date) return `שורת תקבול ${i + 1}: חובה לבחור תאריך.`;
      if (!Number.isFinite(row.amount) || row.amount <= 0)
        return `שורת תקבול ${i + 1}: סכום חייב להיות גדול מ-0.`;
      if (!row.currency) return `שורת תקבול ${i + 1}: חובה לבחור מטבע.`;
    }
  }
  return null;
}

export async function saveDocumentDraftAction(
  documentType: DocumentIssueType,
  payload: DocumentDraftPayload
) {
  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  const minAllowedDate = await getMinAllowedDate(companyId, documentType);
  const err = validatePayload(payload, minAllowedDate);
  if (err) return { ok: false as const, message: err };

  const taxFields =
    documentType === "tax_invoice"
      ? {
          subtotal: payload.subtotal ?? payload.total,
          vat_rate: payload.vatRate ?? 0,
          vat_amount: payload.vatAmount ?? 0,
        }
      : {};

  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: documentType,
      document_status: "draft",
      document_number: null,
      customer_id: payload.customerId || null,
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      document_description: payload.description || null,
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      language: payload.language,
      ...taxFields,
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

  if (documentType === "tax_invoice" && payload.items && payload.items.length > 0) {
    const lineItems = payload.items.map((item, idx) =>
      itemRowToLineItem(item, data.id, companyId, idx + 1, payload.documentDate)
    );

    const { error: lineItemsError } = await supabase
      .from("document_line_items")
      .insert(lineItems);

    if (lineItemsError) {
      console.error("Failed to insert line items:", lineItemsError);
    }
  } else if (payload.payments && payload.payments.length > 0) {
    const lineItems = payload.payments.map((payment, idx) =>
      convertPayment(payment, data.id, companyId, idx + 1)
    );

    const { error: lineItemsError } = await supabase
      .from("document_line_items")
      .insert(lineItems);

    if (lineItemsError) {
      console.error("Failed to insert line items:", lineItemsError);
    }
  }

  return { ok: true as const, draftId: data.id };
}

export async function issueDocumentAction(
  documentType: DocumentIssueType,
  payload: DocumentDraftPayload
) {
  const logPrefix = getLogPrefix(documentType);
  console.log(`${logPrefix} issueDocumentAction entry`, {
    documentType,
    documentDate: payload.documentDate,
    customerName: payload.customerName?.substring(0, 30),
    total: payload.total,
    paymentsCount: payload.payments?.length,
    payloadKeys: Object.keys(payload),
  });

  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const minAllowedDate = await getMinAllowedDate(companyId, documentType);
    console.log(`${logPrefix} Got minAllowedDate`, { minAllowedDate });

    const err = validatePayload(payload, minAllowedDate);
    console.log(`${logPrefix} Validation result`, { hasError: !!err, error: err });

    if (err) {
      console.error(`${logPrefix} Validation failed`, { error: err });
      const errorMessage = typeof err === "string" ? err : String(err) || "שגיאת ולידציה";
      const errorResponse = { ok: false as const, message: errorMessage };
      console.log(`${logPrefix} Returning validation error response`, errorResponse);
      return errorResponse;
    }

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

      const hasActiveConsent =
        !!consentData?.consent_given_at && !consentData?.consent_revoked_at;
      if (!hasActiveConsent) {
        return {
          ok: false as const,
          message:
            "נדרשת הסכמת מקבל למסמך ממוחשב לפני הפקה. סמן/י הסכמה בחלון האישור ואז נסה/י שוב.",
        };
      }
    }

    console.log(`${logPrefix} Creating draft document`, {
      companyId: companyId?.substring(0, 8),
      customerName: payload.customerName?.substring(0, 30),
      documentDate: payload.documentDate,
      total: payload.total,
    });

    const taxFields =
      documentType === "tax_invoice"
        ? {
            subtotal: payload.subtotal ?? payload.total,
            vat_rate: payload.vatRate ?? 0,
            vat_amount: payload.vatAmount ?? 0,
          }
        : {};

    const { data: draft, error: draftError } = await supabase
      .from("documents")
      .insert({
        company_id: companyId,
        document_type: documentType,
        document_status: "draft",
        document_number: null,
        customer_id: payload.customerId || null,
        customer_name: payload.customerName,
        issue_date: payload.documentDate,
        document_description: payload.description || null,
        total_amount: payload.total,
        currency: payload.currency,
        internal_notes: payload.notes,
        language: payload.language,
        ...taxFields,
      })
      .select("id")
      .single();

    if (draftError) {
      console.error(`${logPrefix} Draft creation failed`, {
        error: draftError.message,
        code: draftError.code,
        details: draftError.details,
        hint: draftError.hint,
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

    console.log(`${logPrefix} Draft created`, { draftId: draft.id });

    if (documentType === "tax_invoice" && payload.items && payload.items.length > 0) {
      console.log(`${logPrefix} Inserting item line items`, { count: payload.items.length });
      const lineItems = payload.items.map((item, idx) =>
        itemRowToLineItem(item, draft.id, companyId, idx + 1, payload.documentDate)
      );

      const { error: lineItemsError } = await supabase
        .from("document_line_items")
        .insert(lineItems);

      if (lineItemsError) {
        console.error(`${logPrefix} Failed to insert line items`, {
          error: lineItemsError.message,
          code: lineItemsError.code,
        });
      } else {
        console.log(`${logPrefix} Line items inserted successfully`);
      }
    } else if (payload.payments && payload.payments.length > 0) {
      console.log(`${logPrefix} Inserting payment line items`, { count: payload.payments.length });
      const lineItems = payload.payments.map((payment, idx) =>
        convertPayment(payment, draft.id, companyId, idx + 1)
      );

      const { error: lineItemsError } = await supabase
        .from("document_line_items")
        .insert(lineItems);

      if (lineItemsError) {
        console.error(`${logPrefix} Failed to insert line items`, {
          error: lineItemsError.message,
          code: lineItemsError.code,
        });
      } else {
        console.log(`${logPrefix} Line items inserted successfully`);
      }
    }

    console.log(`${logPrefix} Calling finalizeDocument`, {
      draftId: draft.id,
      companyId: companyId?.substring(0, 8),
      documentType,
    });

    const result = await finalizeDocument(draft.id, companyId, documentType);
    console.log(`${logPrefix} finalizeDocument result`, {
      ok: result.ok,
      documentNumber: result.documentNumber,
      message: result.message,
    });

    if (!result.ok) {
      console.error(`${logPrefix} finalizeDocument failed`, {
        message: result.message,
        draftId: draft.id,
      });
      const errorResponse = {
        ok: false as const,
        message: result.message ?? "Failed to finalize document",
      };
      return errorResponse;
    }

    console.log(`${logPrefix} Fetching company name`, { companyId: companyId?.substring(0, 8) });
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .single();

    if (companyError) {
      console.error(`${logPrefix} Failed to fetch company`, { error: companyError.message });
    }

    console.log(`${logPrefix} issueDocumentAction success`, {
      documentId: draft.id,
      documentNumber: result.documentNumber,
      companyName: company?.company_name,
    });

    return {
      ok: true as const,
      documentId: draft.id,
      documentNumber: result.documentNumber,
      companyName: company?.company_name || "העסק שלי",
      payload,
    };
  } catch (error: any) {
    const errorMessage =
      error?.message || error?.toString() || String(error) || "שגיאה בלתי צפויה בהפקת המסמך";
    const errorType = error?.constructor?.name || typeof error;
    const errorStack = error?.stack || "No stack trace";
    const errorName = error?.name || "Unknown";
    const errorCode = error?.code || error?.statusCode || null;

    console.error(`${getLogPrefix(documentType)} Exception in issueDocumentAction`, {
      error: errorMessage,
      errorType,
      errorName,
      errorCode,
      stack: errorStack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
    });
    return {
      ok: false as const,
      message: errorMessage,
    };
  }
}

export async function updateDocumentDraftAction(
  documentType: DocumentIssueType,
  draftId: string,
  payload: DocumentDraftPayload
) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("id, document_status")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .maybeSingle();

  if (fetchError) return { ok: false as const, message: fetchError.message };
  if (!existing) return { ok: false as const, message: "Draft not found" };

  if (existing.document_status !== "draft") {
    return {
      ok: false as const,
      message: "Cannot edit final documents. Only drafts can be modified.",
    };
  }

  const taxFields =
    documentType === "tax_invoice"
      ? {
          subtotal: payload.subtotal ?? payload.total,
          vat_rate: payload.vatRate ?? 0,
          vat_amount: payload.vatAmount ?? 0,
        }
      : {};

  const { error: updateError } = await supabase
    .from("documents")
    .update({
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      language: payload.language,
      ...taxFields,
    })
    .eq("id", draftId)
    .eq("company_id", companyId);

  if (updateError) {
    if (updateError.code === "PGRST204" && String(updateError.message || "").includes("language")) {
      return {
        ok: false as const,
        message:
          "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
      };
    }
    return { ok: false as const, message: updateError.message };
  }

  return { ok: true as const };
}

export async function getDraftDocumentForEditAction(documentType: DocumentIssueType, draftId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .maybeSingle();

    if (error) return { ok: false as const, message: error.message };
    if (!data) return { ok: false as const, message: "Draft not found" };

    if (data.document_status !== "draft") {
      return {
        ok: false as const,
        message: "Cannot edit final documents. Only drafts can be modified.",
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
        vatRate: typeof (data as any).vat_rate === "number" ? (data as any).vat_rate : null,
        vatAmount: typeof (data as any).vat_amount === "number" ? (data as any).vat_amount : null,
        subtotal: typeof (data as any).subtotal === "number" ? (data as any).subtotal : null,
        vatType:
          typeof (data as any).vat_rate === "number" && (data as any).vat_rate > 0
            ? "regular"
            : "no_vat",
      },
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

export async function getDocumentPreviewUrlAction(
  documentType: DocumentIssueType,
  documentId: string
): Promise<{
  ok: boolean;
  url?: string;
  message?: string;
}> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const documentLabel = getDocumentTypeLabel(documentType);
    const routeSegment = DOCUMENT_ROUTE_SEGMENTS[documentType] || documentType;

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .maybeSingle();

    if (docError || !doc) {
      return { ok: false, message: `${documentLabel} לא נמצא` };
    }

    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();

    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("description, item_date, unit_price, line_total, currency, bank_name, branch, account_number, payment_metadata")
      .eq("document_id", documentId)
      .order("line_number");

    const payments = (lineItems || []).map((item: any) => {
      const metadata = item.payment_metadata || {};

      return {
        method: item.description || "תשלום",
        date: item.item_date || doc.issue_date || new Date().toISOString().split("T")[0],
        amount: item.line_total || 0,
        currency: item.currency || doc.currency || "₪",
        bankName: item.bank_name || metadata.bankName || undefined,
        branch: item.branch || metadata.bankBranch || metadata.branch || undefined,
        accountNumber: item.account_number || metadata.bankAccount || metadata.accountNumber || undefined,
        cardLastDigits: metadata.cardLastDigits || undefined,
        cardType: metadata.cardType || undefined,
        cardDealType: metadata.cardDealType || undefined,
        cardInstallments: metadata.cardInstallments || undefined,
        checkBank: metadata.checkBank || undefined,
        checkBranch: metadata.checkBranch || undefined,
        checkAccount: metadata.checkAccount || undefined,
        checkNumber: metadata.checkNumber || undefined,
        payerAccount: metadata.payerAccount || undefined,
        transactionReference: metadata.transactionReference || undefined,
        description: metadata.description || undefined,
        reference_number: metadata.reference_number || undefined,
        reference: metadata.reference || undefined,
        notes: metadata.notes || undefined,
      };
    });

    const items = (lineItems || []).map((item: any) => {
      const metadata = item.payment_metadata || {};
      return {
        label: metadata.label || item.description || "",
        sku: metadata.sku || "",
        description: metadata.details || item.description || "",
        quantity: item.quantity || 0,
        unitPrice: item.unit_price || 0,
        currency: item.currency || doc.currency || "₪",
        vatMode: metadata.vatMode || "before",
        lineTotal: item.line_total || item.unit_price || 0,
      };
    });

    const params = new URLSearchParams({
      documentId: documentId,
      previewNumber: doc.document_number || "",
      companyName: company?.company_name || "העסק שלי",
      customerName: doc.customer_name || "",
      customerId: doc.customer_id || "",
      documentDate: doc.issue_date || new Date().toISOString().split("T")[0],
      description: (doc as any).description || "",
      notes: doc.internal_notes || "",
      footerNotes: doc.customer_notes || "",
      total: doc.total_amount?.toString() || "0",
      currency: doc.currency || "₪",
      payments: JSON.stringify(payments),
      language: (doc as any)?.language || "he",
    });

    if (documentType === "tax_invoice") {
      params.set("subtotal", String((doc as any).subtotal ?? doc.total_amount ?? 0));
      params.set("vatRate", String((doc as any).vat_rate ?? 0));
      params.set("vatAmount", String((doc as any).vat_amount ?? 0));
      const vatRateNum = Number((doc as any).vat_rate ?? 0);
      params.set("vatType", vatRateNum > 0 ? "regular" : "no_vat");
      params.set("items", JSON.stringify(items));
    }

    const url = `/dashboard/documents/${routeSegment}/preview?${params.toString()}`;

    return { ok: true, url };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Failed to build preview URL" };
  }
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
