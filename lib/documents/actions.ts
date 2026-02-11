"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCompanyIdForUser,
  isSequenceLocked,
  getNextDocumentNumberPreview,
  finalizeDocument,
} from "@/lib/document-helpers";
import { getDocumentConfig } from "@/lib/documents/document-configs";
import type {
  DocumentDraftPayload,
  DocumentIssueType,
  InitialDocumentCreateData,
  OpenDocument,
  PaymentMethod,
  PaymentRow,
  ReceiptDraftPayload,
  ReceiptSettings,
  TaxInvoiceItemRow,
  VatType,
} from "@/lib/documents/types";
import { paymentRowToLineItem as convertPayment } from "@/lib/types/receipt";
import { headers } from "next/headers";
import {
  isDigitalSignaturesEnabled,
  DIGITAL_SIGNATURES_DEFERRED_MESSAGE,
} from "@/lib/documents/signing/feature-flags";

const DOCUMENT_ROUTE_SEGMENTS: Record<DocumentIssueType, string> = {
  receipt: "receipt",
  "tax_invoice": "tax-invoice",
  invoiceReceipt: "invoice-receipt",
  creditNote: "credit-note",
  quote: "quote",
  proforma: "proforma",
  workOrder: "work-order",
  deliveryNote: "delivery-note",
  returnNote: "return-note",
  purchaseOrder: "purchase-order",
  selfInvoice: "self-invoice",
  selfCreditNote: "self-credit-note",
};

const DOCUMENT_TYPE_LABELS: Record<DocumentIssueType, string> = {
  receipt: "קבלה",
  "tax_invoice": "חשבונית מס",
  invoiceReceipt: "חשבונית מס / קבלה",
  creditNote: "חשבונית זיכוי",
  quote: "הצעת מחיר",
  proforma: "חשבון עסקה (דרישת תשלום)",
  workOrder: "הזמנת עבודה",
  deliveryNote: "תעודת משלוח",
  returnNote: "תעודת החזרה",
  purchaseOrder: "הזמנת רכש",
  selfInvoice: "חשבונית עצמית",
  selfCreditNote: "חשבונית זיכוי עצמית",
};

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

function toDbDocumentType(documentType: DocumentIssueType) {
  if (documentType === "invoiceReceipt") return "invoice_receipt";
  if (documentType === "creditNote") return "credit_note";
  if (documentType === "workOrder") return "work_order";
  if (documentType === "deliveryNote") return "delivery_note";
  if (documentType === "returnNote") return "return_note";
  if (documentType === "purchaseOrder") return "purchase_order";
  if (documentType === "selfInvoice") return "self_invoice";
  if (documentType === "selfCreditNote") return "self_credit_note";
  return documentType;
}

function isItemDocumentType(documentType: DocumentIssueType) {
  return (
    documentType === "tax_invoice" ||
    documentType === "invoiceReceipt" ||
    documentType === "creditNote" ||
    documentType === "quote" ||
    documentType === "proforma" ||
    documentType === "workOrder" ||
    documentType === "deliveryNote" ||
    documentType === "returnNote" ||
    documentType === "purchaseOrder" ||
    documentType === "selfInvoice" ||
    documentType === "selfCreditNote"
  );
}

function getDocumentBasePath(documentType: DocumentIssueType) {
  const config = getDocumentConfig(documentType);
  if (config?.category === "business") return "/business/documents";
  return "/dashboard/documents";
}

function firstDayOfMonthUtcIso(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function precheckSubscriptionEligibility(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
}): Promise<
  | {
      ok: true;
      planId: string;
      status: string;
      documentsUsed: number;
      documentsLimit: number;
      yearMonth: string;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
    }
  | {
      ok: false;
      reason: "account_blocked" | "trial_ended" | "subscription_expired" | "limit_reached" | "unknown";
      message: string;
    }
> {
  const { supabase, companyId } = params;

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("plan_id,status,trial_ends_at,current_period_end")
    .eq("company_id", companyId)
    .maybeSingle();

  if (subError || !sub) {
    const isMissingSubscriptionsTable =
      String((subError as any)?.code || "") === "PGRST205" ||
      String((subError as any)?.message || "").includes("public.subscriptions") ||
      String((subError as any)?.message || "").includes("table 'public.subscriptions'")

    if (isMissingSubscriptionsTable) {
      return {
        ok: false,
        reason: "unknown",
        message:
          "חסרות טבלאות מנויים (subscriptions/plans/usage_monthly) בפרויקט Supabase המחובר. " +
          "נא להריץ בסדר הזה: scripts/045-subscriptions-schema-v1.sql ואז scripts/046-subscriptions-rls-v1.sql, " +
          "להמתין לרענון schema cache, ואז לנסות שוב.",
      }
    }

    return {
      ok: false,
      reason: "unknown",
      message: "לא ניתן לאמת סטטוס מנוי. נסה שוב בעוד רגע.",
    };
  }

  const planId = String((sub as any).plan_id || "");
  const status = String((sub as any).status || "");
  const trialEndsAt = (sub as any).trial_ends_at ? String((sub as any).trial_ends_at) : null;
  const currentPeriodEnd = (sub as any).current_period_end ? String((sub as any).current_period_end) : null;

  if (["blocked", "canceled", "past_due"].includes(status)) {
    return { ok: false, reason: "account_blocked", message: "החשבון חסום. לא ניתן להפיק מסמכים חדשים." };
  }

  const now = new Date();
  if (status === "trial" && trialEndsAt && now > new Date(trialEndsAt)) {
    return { ok: false, reason: "trial_ended", message: "תקופת הניסיון הסתיימה. לא ניתן להפיק מסמכים חדשים." };
  }

  if (status === "active") {
    if (!currentPeriodEnd || now > new Date(currentPeriodEnd)) {
      return { ok: false, reason: "subscription_expired", message: "המנוי פג. לא ניתן להפיק מסמכים חדשים." };
    }
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("documents_per_month")
    .eq("id", planId)
    .maybeSingle();

  if (planError || !plan) {
    return { ok: false, reason: "unknown", message: "לא ניתן לאמת תכנית מנוי. נסה שוב בעוד רגע." };
  }

  const documentsLimit = Number((plan as any).documents_per_month ?? 0) || 0;
  const yearMonth = firstDayOfMonthUtcIso(now);
  const { data: usage, error: usageError } = await supabase
    .from("usage_monthly")
    .select("documents_count")
    .eq("company_id", companyId)
    .eq("year_month", yearMonth)
    .maybeSingle();

  if (usageError) {
    return { ok: false, reason: "unknown", message: "לא ניתן לאמת שימוש חודשי. נסה שוב בעוד רגע." };
  }

  const documentsUsed = Number((usage as any)?.documents_count ?? 0) || 0;
  if (documentsLimit > 0 && documentsUsed >= documentsLimit) {
    return {
      ok: false,
      reason: "limit_reached",
      message: "הגעת למגבלת המסמכים החודשית. לא ניתן להפיק מסמכים חדשים.",
    };
  }

  return {
    ok: true,
    planId,
    status,
    documentsUsed,
    documentsLimit,
    yearMonth,
    trialEndsAt,
    currentPeriodEnd,
  };
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
    item_sku: item.sku || null, // ✅ שמירה ישירה של המק"ט
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
    // Allow digital signatures even if customer is not saved
    // Use customer name as the identifier
    return { ok: true, recipientIdentifier: customerName };
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("email, phone, mobile, tax_id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) {
    // Allow digital signatures even if customer fetch fails
    // Use customer name as fallback
    return { ok: true, recipientIdentifier: customerName };
  }

  const recipientIdentifier =
    firstNonEmpty(customer.email, customer.phone, customer.mobile, customer.tax_id) || customerName;

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
    const { data: { user } } = await supabase.auth.getUser();

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
  const dbDocumentType = toDbDocumentType(documentType);
  const { data, error } = await supabase
    .from("documents")
    .select("issue_date")
    .eq("company_id", companyId)
    .eq("document_type", dbDocumentType)
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
    const minAllowedDate = await getMinAllowedDate(companyId, documentType);

    let companyName: string | null = null;
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();
    companyName = company?.company_name ?? null;

    let previewNumber: string | null = null;
    let draftId: string | null = null;
    let draftOrigin: "existing" | "new" | undefined = undefined;

    // For locked sequences (regulatory numbering), we MUST show a number that was
    // actually reserved on the server and tied to a draft. This prevents stale
    // numbers on back/forward navigation and guarantees consistency.
    if (locked) {
      const dbDocumentType = toDbDocumentType(documentType);

      const { data: existingDraft, error: existingDraftError } = await supabase
        .from("documents")
        .select("id, document_number")
        .eq("company_id", companyId)
        .eq("document_type", dbDocumentType)
        .eq("document_status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDraftError) {
        return { ok: false, message: existingDraftError.message };
      }

      if (existingDraft?.id) {
        draftId = existingDraft.id;
        draftOrigin = "existing";
        previewNumber = existingDraft.document_number ?? null;

        // If an old draft exists with a stale/non-allocator number (e.g. created before lock flow),
        // we must re-reserve a fresh number from the single allocator to avoid showing "fake" numbers.
        if (previewNumber) {
          const parseNumber = (raw: string, prefix: string) => {
            const s = String(raw || "").trim();
            if (!s) return null;
            if (prefix && s.startsWith(prefix)) {
              const n = parseInt(s.slice(prefix.length), 10);
              return Number.isFinite(n) ? n : null;
            }
            // No prefix case (most common)
            const n = parseInt(s, 10);
            return Number.isFinite(n) ? n : null;
          };

          const { data: seqRow } = await supabase
            .from("document_sequences")
            .select("current_number, starting_number, prefix, is_locked")
            .eq("company_id", companyId)
            .eq("document_type", dbDocumentType)
            .maybeSingle();

          const prefix = typeof (seqRow as any)?.prefix === "string" ? String((seqRow as any).prefix) : "";
          const currentNumber =
            typeof (seqRow as any)?.current_number === "number" ? Number((seqRow as any).current_number) : null;
          const parsedDraftNumber = parseNumber(previewNumber, prefix);

          // If the draft number is < current_number, it's stale/already passed -> must re-reserve.
          // NOTE: equality means "already reserved" for this draft and must be kept stable.
          if (currentNumber !== null && parsedDraftNumber !== null && parsedDraftNumber < currentNumber) {
            previewNumber = null; // force re-reserve below (same draft)
          }
        }
      } else {
        const baseDraftInsert: any = {
          company_id: companyId,
          document_type: dbDocumentType,
          document_status: "draft",
          document_number: null,
          customer_id: null,
          customer_name: "",
          issue_date: todayYmd(),
          total_amount: 0,
          currency: "₪",
          internal_notes: "",
          language: "he",
        };

        if (isItemDocumentType(documentType)) {
          baseDraftInsert.subtotal = 0;
          baseDraftInsert.vat_rate = 0;
          baseDraftInsert.vat_amount = 0;
        }

        const { data: createdDraft, error: createDraftError } = await supabase
          .from("documents")
          .insert(baseDraftInsert)
          .select("id")
          .single();

        if (createDraftError) {
          if (
            createDraftError.code === "PGRST204" &&
            String(createDraftError.message || "").includes("language")
          ) {
            return {
              ok: false,
              message:
                "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
            };
          }
          return { ok: false, message: createDraftError.message };
        }

        draftId = createdDraft?.id ?? null;
        draftOrigin = "new";
      }

      // Ensure the draft has a reserved document number.
      if (draftId && !previewNumber) {
        const { data: generatedNumber, error: rpcError } = await supabase.rpc(
          "generate_document_number",
          {
            p_company_id: companyId,
            p_document_type: dbDocumentType,
          }
        );

        if (rpcError) return { ok: false, message: rpcError.message };

        const { error: updateError } = await supabase
          .from("documents")
          .update({ document_number: generatedNumber })
          .eq("id", draftId)
          .eq("company_id", companyId);

        if (updateError) return { ok: false, message: updateError.message };

        previewNumber = generatedNumber ?? null;
      }
    } else {
      // Unlocked sequences: show a non-allocating preview number.
      const { formatted } = await getNextDocumentNumberPreview(companyId, documentType);
      previewNumber = formatted ?? null;
    }

    const settings: ReceiptSettings = {
      allowedCurrencies: ["ILS", "USD", "EUR"],
      defaultCurrency: "ILS",
      language: "he",
      roundTotals: false,
    };

    let vatRate: number | undefined = undefined;
    if (isItemDocumentType(documentType)) {
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
      draftId,
      draftOrigin,
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
  if (isItemDocumentType(p.documentType) && Array.isArray(p.items)) {
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
    const allowNegativePayments = (p as any)?.allowNegativePayments === true;
    if (!Array.isArray(p.payments) || p.payments.length === 0)
      return "חובה להוסיף לפחות תקבול אחד.";
    for (const [i, row] of p.payments.entries()) {
      if (!row.method) return `שורת תקבול ${i + 1}: חובה לבחור אמצעי תשלום.`;
      if (!row.date) return `שורת תקבול ${i + 1}: חובה לבחור תאריך.`;
      if (!Number.isFinite(row.amount) || (allowNegativePayments ? row.amount >= 0 : row.amount <= 0))
        return `שורת תקבול ${i + 1}: סכום חייב להיות ${allowNegativePayments ? "קטן מ-0" : "גדול מ-0"}.`;
      if (!row.currency) return `שורת תקבול ${i + 1}: חובה לבחור מטבע.`;
    }
  }
  return null;
}

async function replaceDocumentLineItems(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  documentType: DocumentIssueType;
  documentId: string;
  payload: DocumentDraftPayload;
}) {
  const { supabase, companyId, documentType, documentId, payload } = args;
  const { error: deleteError } = await supabase
    .from("document_line_items")
    .delete()
    .eq("document_id", documentId)
    .eq("company_id", companyId);

  if (deleteError) return deleteError;

  if (isItemDocumentType(documentType) && payload.items && payload.items.length > 0) {
    const lineItems = payload.items.map((item, idx) =>
      itemRowToLineItem(item, documentId, companyId, idx + 1, payload.documentDate)
    );
    const { error: lineItemsError } = await supabase.from("document_line_items").insert(lineItems);
    if (lineItemsError) return lineItemsError;
  } else if (payload.payments && payload.payments.length > 0) {
    const lineItems = payload.payments.map((payment, idx) =>
      convertPayment(payment, documentId, companyId, idx + 1)
    );
    const { error: lineItemsError } = await supabase.from("document_line_items").insert(lineItems);
    if (lineItemsError) return lineItemsError;
  }

  return null;
}

export async function saveDocumentDraftAction(
  documentType: DocumentIssueType,
  payload: DocumentDraftPayload
) {
  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();
  const dbDocumentType = toDbDocumentType(documentType);

  const minAllowedDate = await getMinAllowedDate(companyId, documentType);
  const err = validatePayload(payload, minAllowedDate);
  if (err) return { ok: false as const, message: err };

  const taxFields = isItemDocumentType(documentType)
    ? {
        subtotal: payload.subtotal ?? payload.total,
        vat_rate: payload.vatRate ?? 0,
        vat_amount: payload.vatAmount ?? 0,
      }
    : {};

  // If the sequence is locked (regulatory numbering), we must NOT create new drafts on "Save Draft".
  // There should be at most one open draft per (company, document_type). Reuse it to preserve reserved numbers.
  const { locked } = await isSequenceLocked({ companyId, documentType });
  if (locked) {
    const { data: existingDraft } = await supabase
      .from("documents")
      .select("id, document_number, document_status")
      .eq("company_id", companyId)
      .eq("document_type", dbDocumentType)
      .eq("document_status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDraft?.id) {
      const baseUpdate = {
        customer_id: payload.customerId || null,
        customer_name: payload.customerName,
        issue_date: payload.documentDate,
        payment_due_date: payload.paymentDueDate || null,
        document_description: payload.description || null,
        total_amount: payload.total,
        currency: payload.currency,
        internal_notes: payload.notes,
        language: payload.language,
        ...taxFields,
      };

      let { error: updateError } = await supabase
        .from("documents")
        .update(baseUpdate)
        .eq("id", existingDraft.id)
        .eq("company_id", companyId)
        .eq("document_status", "draft");

      if (updateError) {
        const updateMessage = String(updateError.message || "");
        if (updateError.code === "PGRST204" && updateMessage.includes("payment_due_date")) {
          const { payment_due_date: _paymentDueDate, ...fallbackUpdate } = baseUpdate as any;
          ({ error: updateError } = await supabase
            .from("documents")
            .update(fallbackUpdate)
            .eq("id", existingDraft.id)
            .eq("company_id", companyId)
            .eq("document_status", "draft"));
        }
      }
      if (updateError) return { ok: false as const, message: updateError.message };

      const lineItemsError = await replaceDocumentLineItems({
        supabase,
        companyId,
        documentType,
        documentId: existingDraft.id,
        payload,
      });
      if (lineItemsError) {
        console.error("Failed to replace line items:", lineItemsError);
      }

      return { ok: true as const, draftId: existingDraft.id };
    }
  }

  const baseInsert = {
    company_id: companyId,
    document_type: dbDocumentType,
    document_status: "draft",
    document_number: null,
    customer_id: payload.customerId || null,
    customer_name: payload.customerName,
    issue_date: payload.documentDate,
    payment_due_date: payload.paymentDueDate || null,
    document_description: payload.description || null,
    total_amount: payload.total,
    currency: payload.currency,
    internal_notes: payload.notes,
    language: payload.language,
    ...taxFields,
  };

  let { data, error } = await supabase
    .from("documents")
    .insert(baseInsert)
    .select("id")
    .single();

  if (error) {
    const message = String(error.message || "");
    if (error.code === "PGRST204" && message.includes("payment_due_date")) {
      const { payment_due_date: _paymentDueDate, ...fallbackInsert } = baseInsert;
      ({ data, error } = await supabase
        .from("documents")
        .insert(fallbackInsert)
        .select("id")
        .single());
    }
    if (error && error.code === "PGRST204" && String(error.message || "").includes("language")) {
      return {
        ok: false as const,
        message:
          "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
      };
    }
    if (error) return { ok: false as const, message: error.message };
  }
  if (!data) {
    return { ok: false as const, message: "Draft creation failed." };
  }

  if (isItemDocumentType(documentType) && payload.items && payload.items.length > 0) {
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
  payload: DocumentDraftPayload,
  draftId?: string
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

  let agentFlow: {
    step:
      | "entry"
      | "after_validation"
      | "validation_failed_return"
      | "draft_fetch_done"
      | "draft_fetch_error_return"
      | "draft_not_found_return"
      | "draft_not_draft_return"
      | "update_error_return"
      | "eligibility_block_return"
      | "calling_finalize"
      | "finalize_done"
      | "create_draft_branch"
      | "exception";
    hasDraftId: boolean;
    ok: boolean | null;
    note: string | null;
  } = {
    step: "entry",
    hasDraftId: typeof draftId === "string" && draftId.length > 0,
    ok: null,
    note: null,
  };

  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const dbDocumentType = toDbDocumentType(documentType);
    const minAllowedDate = await getMinAllowedDate(companyId, documentType);
    console.log(`${logPrefix} Got minAllowedDate`, { minAllowedDate });

    const err = validatePayload(payload, minAllowedDate);
    console.log(`${logPrefix} Validation result`, { hasError: !!err, error: err });

    agentFlow.step = "after_validation";

    if (err) {
      agentFlow.step = "validation_failed_return";
      agentFlow.ok = false;
      agentFlow.note = "validation_failed";
      console.error(`${logPrefix} Validation failed`, { error: err });
      const errorMessage = typeof err === "string" ? err : String(err) || "שגיאת ולידציה";
      const errorResponse = { ok: false as const, message: errorMessage };
      console.log(`${logPrefix} Returning validation error response`, errorResponse);
      return errorResponse;
    }

    // Recipient consent requirement disabled:
    // Business requirement: once a user is logged-in, consent is treated as granted.
    // We still keep the digital-signature flow enabled elsewhere.

    if (draftId) {
      const { data: existing, error: fetchError } = await supabase
        .from("documents")
        .select("id, document_status")
        .eq("id", draftId)
        .eq("company_id", companyId)
        .eq("document_type", dbDocumentType)
        .maybeSingle();

      agentFlow.step = "draft_fetch_done";

      if (fetchError) {
        agentFlow.step = "draft_fetch_error_return";
        agentFlow.ok = false;
        agentFlow.note = "draft_fetch_error";
        return { ok: false as const, message: fetchError.message };
      }
      if (!existing) {
        agentFlow.step = "draft_not_found_return";
        agentFlow.ok = false;
        agentFlow.note = "draft_not_found";
        return { ok: false as const, message: "Draft not found" };
      }

      if (existing.document_status !== "draft") {
        agentFlow.step = "draft_not_draft_return";
        agentFlow.ok = false;
        agentFlow.note = `not_draft:${String(existing.document_status || "")}`;
        return {
          ok: false as const,
          message: "Cannot edit final documents. Only drafts can be modified.",
        };
      }

      const taxFields = isItemDocumentType(documentType)
        ? {
            subtotal: payload.subtotal ?? payload.total,
            vat_rate: payload.vatRate ?? 0,
            vat_amount: payload.vatAmount ?? 0,
          }
        : {};

      const baseUpdate = {
        customer_id: payload.customerId || null,
        customer_name: payload.customerName,
        issue_date: payload.documentDate,
        payment_due_date: payload.paymentDueDate || null,
        document_description: payload.description || null,
        total_amount: payload.total,
        currency: payload.currency,
        internal_notes: payload.notes,
        language: payload.language,
        ...taxFields,
      };

      let { error: updateError } = await supabase
        .from("documents")
        .update(baseUpdate)
        .eq("id", draftId)
        .eq("company_id", companyId);

      if (updateError) {
        const updateMessage = String(updateError.message || "");
        if (updateError.code === "PGRST204" && updateMessage.includes("payment_due_date")) {
          const { payment_due_date: _paymentDueDate, ...fallbackUpdate } = baseUpdate;
          ({ error: updateError } = await supabase
            .from("documents")
            .update(fallbackUpdate)
            .eq("id", draftId)
            .eq("company_id", companyId));
        }
        if (updateError && updateError.code === "PGRST204" && String(updateError.message || "").includes("language")) {
          return {
            ok: false as const,
            message:
              "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
          };
        }
        if (updateError) {
          agentFlow.step = "update_error_return";
          agentFlow.ok = false;
          agentFlow.note = "update_error";
          return { ok: false as const, message: updateError.message };
        }
      }

      const lineItemsError = await replaceDocumentLineItems({
        supabase,
        companyId,
        documentType,
        documentId: draftId,
        payload,
      });

      if (lineItemsError) {
        console.error(`${logPrefix} Failed to replace line items`, lineItemsError);
      }

      const eligibility = await precheckSubscriptionEligibility({ supabase, companyId });
      if (!eligibility.ok) {
        agentFlow.step = "eligibility_block_return";
        agentFlow.ok = false;
        agentFlow.note = `${eligibility.reason || "eligibility_blocked"}:${String(eligibility.message || "").slice(0, 120)}`;
        return {
          ok: false as const,
          message: eligibility.message,
          reason: eligibility.reason,
        };
      }

      // Ensure deterministic issuance uses the canonical Admin template snapshot.
      // We persist the resolved template id into documents.template_version_id (idempotent).
      try {
        const { getTemplateForDocument } = await import("@/lib/pdf-service")
        const chosen = await getTemplateForDocument(companyId, dbDocumentType as any, {
          language: payload.language === "en" ? "en" : "he",
          allowFallbackToHe: true,
        })
        if (chosen?.templateId) {
          await supabase
            .from("documents")
            .update({ template_version_id: chosen.templateId })
            .eq("id", draftId)
            .eq("company_id", companyId)
            .is("template_version_id", null)
        }
      } catch {
        // ignore (template snapshot is best-effort)
      }

      console.log(`${logPrefix} Calling finalizeDocument`, {
        draftId,
        companyId: companyId?.substring(0, 8),
        documentType,
      });
      const agentFinalizeT0 = Date.now()

      agentFlow.step = "calling_finalize";

      const userRes = await supabase.auth.getUser();
      const createdByEmail = userRes?.data?.user?.email ?? null;
      const createdByName =
        (userRes?.data?.user?.user_metadata as any)?.full_name ||
        (userRes?.data?.user?.user_metadata as any)?.name ||
        createdByEmail ||
        null;
      
      const result = await finalizeDocument(draftId, companyId, documentType, {
        createdByName,
        createdByEmail,
      });
      
                
      console.log(`${logPrefix} finalizeDocument result`, {
        ok: result.ok,
        documentNumber: result.documentNumber,
      });

      agentFlow.step = "finalize_done";
      agentFlow.ok = result.ok;
      agentFlow.note = result.ok ? "finalize_ok" : (result.message || "finalize_failed");

      if (!result.ok) {
        const rawMessage = result.message || "Failed to issue document"
        if (rawMessage === "TEMPLATE_NOT_FOUND") {
          return {
            ok: false as const,
            message:
              "אין תבנית פעילה למסמך הזה במערכת (Admin Templates). " +
              "כדי להפיק מסמך חדש חייבת להיות לפחות תבנית אחת פעילה עבור סוג המסמך (tax_invoice / invoice_receipt). " +
              "פתח /admin/templates וצור/הפעל תבנית מתאימה (is_active=true) וודא שהיא משויכת לסוג המסמך.",
          }
        }
        console.error(`${logPrefix} finalizeDocument failed`, {
          message: rawMessage,
          draftId,
        });
        return { ok: false as const, message: rawMessage, reason: (result as any)?.reason ?? null };
      }

      const { data: company } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", companyId)
        .maybeSingle();

      return {
        ok: true as const,
        documentId: draftId,
        documentNumber: result.documentNumber,
        companyName: company?.company_name || "העסק שלי",
        payload,
        signing: (result as any).signing ?? null,
      };
    }

    agentFlow.step = "create_draft_branch";
    console.log(`${logPrefix} Creating draft document`, {
      companyId: companyId?.substring(0, 8),
      customerName: payload.customerName?.substring(0, 30),
      documentDate: payload.documentDate,
      total: payload.total,
    });

    const taxFields = isItemDocumentType(documentType)
      ? {
          subtotal: payload.subtotal ?? payload.total,
          vat_rate: payload.vatRate ?? 0,
          vat_amount: payload.vatAmount ?? 0,
        }
      : {};

    // Best-effort: snapshot the canonical template id at draft creation time.
    let templateVersionId: string | null = null
    try {
      const { getTemplateForDocument } = await import("@/lib/pdf-service")
      const chosen = await getTemplateForDocument(companyId, dbDocumentType as any, {
        language: payload.language === "en" ? "en" : "he",
        allowFallbackToHe: true,
      })
      templateVersionId = chosen?.templateId || null
    } catch {
      templateVersionId = null
    }

    const baseDraftInsert = {
      company_id: companyId,
      document_type: dbDocumentType,
      document_status: "draft",
      document_number: null,
      template_version_id: templateVersionId,
      customer_id: payload.customerId || null,
      customer_name: payload.customerName,
      issue_date: payload.documentDate,
      payment_due_date: payload.paymentDueDate || null,
      document_description: payload.description || null,
      total_amount: payload.total,
      currency: payload.currency,
      internal_notes: payload.notes,
      language: payload.language,
      ...taxFields,
    };

    let { data: draft, error: draftError } = await supabase
      .from("documents")
      .insert(baseDraftInsert)
      .select("id")
      .single();

    if (draftError) {
      const message = String(draftError.message || "");
      if (draftError.code === "PGRST204" && message.includes("payment_due_date")) {
        const { payment_due_date: _paymentDueDate, ...fallbackInsert } = baseDraftInsert;
        ({ data: draft, error: draftError } = await supabase
          .from("documents")
          .insert(fallbackInsert)
          .select("id")
          .single());
      }
    }
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
    if (!draft) {
      return { ok: false as const, message: "Failed to create draft document" };
    }

    console.log(`${logPrefix} Draft created`, { draftId: draft.id });

    if (isItemDocumentType(documentType) && payload.items && payload.items.length > 0) {
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

    const eligibility = await precheckSubscriptionEligibility({ supabase, companyId });
    if (!eligibility.ok) {
      agentFlow.step = "eligibility_block_return";
      agentFlow.ok = false;
      agentFlow.note = `${eligibility.reason || "eligibility_blocked"}:${String(eligibility.message || "").slice(0, 120)}`;
      return {
        ok: false as const,
        message: eligibility.message,
        reason: eligibility.reason,
      };
    }

    console.log(`${logPrefix} Calling finalizeDocument`, {
      draftId: draft.id,
      companyId: companyId?.substring(0, 8),
      documentType,
    });
    
    const userRes = await supabase.auth.getUser();
    const createdByEmail = userRes?.data?.user?.email ?? null;
    const createdByName =
      (userRes?.data?.user?.user_metadata as any)?.full_name ||
      (userRes?.data?.user?.user_metadata as any)?.name ||
      createdByEmail ||
      null;
    
    const result = await finalizeDocument(draft.id, companyId, documentType, {
      createdByName,
      createdByEmail,
    });
    
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
      signing: (result as any).signing ?? null,
    };
  } catch (error: any) {
    agentFlow.step = "exception";
    agentFlow.ok = false;
    agentFlow.note = error instanceof Error ? error.message : String(error);
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
  } finally {
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
  const dbDocumentType = toDbDocumentType(documentType);

  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("id, document_status, document_number")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("document_type", dbDocumentType)
    .maybeSingle();

  if (fetchError) return { ok: false as const, message: fetchError.message };
  if (!existing) return { ok: false as const, message: "Draft not found" };

  if (existing.document_status !== "draft") {
    return {
      ok: false as const,
      message: "Cannot edit final documents. Only drafts can be modified.",
    };
  }

  const taxFields = isItemDocumentType(documentType)
    ? {
        subtotal: payload.subtotal ?? payload.total,
        vat_rate: payload.vatRate ?? 0,
        vat_amount: payload.vatAmount ?? 0,
      }
    : {};

  const baseUpdate = {
    customer_id: payload.customerId || null,
    customer_name: payload.customerName,
    issue_date: payload.documentDate,
    payment_due_date: payload.paymentDueDate || null,
    document_description: payload.description || null,
    total_amount: payload.total,
    currency: payload.currency,
    internal_notes: payload.notes,
    language: payload.language,
    ...taxFields,
  };

  let { error: updateError } = await supabase
    .from("documents")
    .update(baseUpdate)
    .eq("id", draftId)
    .eq("company_id", companyId);

  if (updateError) {
    const updateMessage = String(updateError.message || "");
    if (updateError.code === "PGRST204" && updateMessage.includes("payment_due_date")) {
      const { payment_due_date: _paymentDueDate, ...fallbackUpdate } = baseUpdate;
      ({ error: updateError } = await supabase
        .from("documents")
        .update(fallbackUpdate)
        .eq("id", draftId)
        .eq("company_id", companyId));
    }
    if (updateError && updateError.code === "PGRST204" && String(updateError.message || "").includes("language")) {
      return {
        ok: false as const,
        message:
          "שגיאה במסד הנתונים: חסרה עמודה documents.language. נא להריץ את scripts/018-add-documents-language.sql ב-Supabase SQL Editor ואז לנסות שוב.",
      };
    }
    if (updateError) return { ok: false as const, message: updateError.message };
  }

  const lineItemsError = await replaceDocumentLineItems({
    supabase,
    companyId,
    documentType,
    documentId: draftId,
    payload,
  });

  if (lineItemsError) {
    console.error("Failed to replace line items:", lineItemsError);
  }

  return { ok: true as const };
}

export async function getDraftDocumentForEditAction(documentType: DocumentIssueType, draftId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const dbDocumentType = toDbDocumentType(documentType);

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("document_type", dbDocumentType)
      .maybeSingle();

    if (error) return { ok: false as const, message: error.message };
    if (!data) return { ok: false as const, message: "Draft not found" };

    if (data.document_status !== "draft") {
      return {
        ok: false as const,
        message: "Cannot edit final documents. Only drafts can be modified.",
      };
    }

    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("*")
      .eq("document_id", draftId)
      .eq("company_id", companyId)
      .order("line_number");

    let items: TaxInvoiceItemRow[] = [];
    let payments: PaymentRow[] = [];
    if (lineItems && lineItems.length > 0) {
      items = lineItems.map((item: any) => {
        const metadata = item.payment_metadata || {};
        return {
          label: metadata.label || item.description || "",
          sku: metadata.sku || item.item_sku || "",
          description: metadata.details || item.description || "",
          quantity: typeof item.quantity === "number" ? item.quantity : 1,
          unitPrice: typeof item.unit_price === "number" ? item.unit_price : 0,
          currency: item.currency || data.currency || "₪",
          vatMode: metadata.vatMode || "before",
          lineTotal: typeof item.line_total === "number" ? item.line_total : 0,
        };
      });
      payments = lineItems.map((item: any) => {
        const metadata = item.payment_metadata || {};
        return {
          method: item.description || "תשלום",
          date: item.item_date || data.issue_date || new Date().toISOString().split("T")[0],
          amount: typeof item.line_total === "number" ? item.line_total : Number(item.line_total || 0),
          currency: item.currency || data.currency || "₪",
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
    }

    return {
      ok: true as const,
      draft: {
        id: data.id,
        customerName: data.customer_name ?? "",
        documentDate: data.issue_date ?? todayYmd(),
        paymentDueDate: (data as any).payment_due_date ?? null,
        description: data.document_description ?? "",
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
        items,
        payments,
      },
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Get document by ID for chaining purposes (prefill items).
 * Returns basic document info + line items from document_line_items table.
 */
export async function getDocumentForChainingAction(documentId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Get document
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) return { ok: false as const, message: error.message };
    if (!data) return { ok: false as const, message: "Document not found" };

    // Get line items from separate table
    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("*")
      .eq("document_id", documentId)
      .eq("company_id", companyId)
      .order("line_number");

    let items: TaxInvoiceItemRow[] = [];
    let payments: PaymentRow[] = [];
    if (lineItems && lineItems.length > 0) {
      items = lineItems.map((item: any) => {
        // Parse payment_metadata if exists (for receipts/invoices)
        const metadata = item.payment_metadata || {};
        
        return {
          label: metadata.label || item.description || "",
          sku: metadata.sku || item.item_sku || "",
          description: metadata.details || item.description || "",
          quantity: typeof item.quantity === "number" ? item.quantity : 1,
          unitPrice: typeof item.unit_price === "number" ? item.unit_price : 0,
          currency: item.currency || data.currency || "₪",
          vatMode: metadata.vatMode || "before",
          lineTotal: typeof item.line_total === "number" ? item.line_total : 0,
        };
      });
      payments = lineItems.map((item: any) => {
        const metadata = item.payment_metadata || {};
        return {
          method: item.description || "תשלום",
          date: item.item_date || data.issue_date || new Date().toISOString().split("T")[0],
          amount: typeof item.line_total === "number" ? item.line_total : Number(item.line_total || 0),
          currency: item.currency || data.currency || "₪",
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
    }

    return {
      ok: true as const,
      document: {
        id: data.id,
        documentType: data.document_type,
        customerId: data.customer_id,
        customerName: data.customer_name ?? "",
        documentDescription: data.document_description ?? "",
        documentDate: data.issue_date ?? null,
        currency: data.currency ?? "₪",
        totalAmount: typeof data.total_amount === "number" ? data.total_amount : 0,
        items,
        payments,
        vatRate: typeof (data as any).vat_rate === "number" ? (data as any).vat_rate : null,
        vatType:
          typeof (data as any).vat_rate === "number" && (data as any).vat_rate > 0
            ? ("regular" as const)
            : ("no_vat" as const),
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
    const dbDocumentType = toDbDocumentType(documentType);
    const documentLabel = getDocumentTypeLabel(documentType);
    const routeSegment = DOCUMENT_ROUTE_SEGMENTS[documentType] || documentType;

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .eq("document_type", dbDocumentType)
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

    if (isItemDocumentType(documentType)) {
      params.set("subtotal", String((doc as any).subtotal ?? doc.total_amount ?? 0));
      params.set("vatRate", String((doc as any).vat_rate ?? 0));
      params.set("vatAmount", String((doc as any).vat_amount ?? 0));
      const vatRateNum = Number((doc as any).vat_rate ?? 0);
      params.set("vatType", vatRateNum > 0 ? "regular" : "no_vat");
      params.set("items", JSON.stringify(items));
      if ((doc as any).payment_due_date) {
        params.set("paymentDueDate", String((doc as any).payment_due_date));
      }
    }

    const basePath = getDocumentBasePath(documentType);
    const url = `${basePath}/${routeSegment}/preview?${params.toString()}`;

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

// =====================================================
// Document links (organizational only)
// =====================================================

type DocumentLinkType = "payment" | "credit" | "conversion" | "cancellation" | "related";

type DocumentLinkDTO = {
  id: string;
  linkType: DocumentLinkType;
  amount: number;
  note: string | null;
  createdAt: string;
  source: {
    id: string;
    documentType: string;
    documentNumber: string;
    documentStatus: string;
    issueDate: string | null;
    totalAmount: number;
    customerName: string | null;
  };
  target: {
    id: string;
    documentType: string;
    documentNumber: string;
    documentStatus: string;
    issueDate: string | null;
    totalAmount: number;
    customerName: string | null;
  };
};

type OpenDocumentInternal = {
  id: string;
  document_number: string | null;
  document_type: string;
  total_amount: number | null;
  outstanding_balance: number | null;
  accounting_status: string | null;
  issue_date: string | null;
};

export async function getOpenDocumentsByCustomer(
  customerId: string,
  companyId: string
): Promise<{ ok: true; data: OpenDocument[] } | { ok: false; message: string }> {
  try {
    if (!customerId) return { ok: false, message: "חסר מזהה לקוח" };
    if (!companyId) return { ok: false, message: "חסר מזהה חברה" };

    const currentCompanyId = await getCompanyIdForUser();
    if (currentCompanyId !== companyId) {
      return { ok: false, message: "אי התאמה בין חברה נבחרת לחברה מחוברת" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, document_number, document_type, total_amount, outstanding_balance, accounting_status, issue_date"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("document_status", "final")
      .in("accounting_status", ["open", "partially_paid"])
      .in("document_type", ["tax_invoice", "invoice_receipt", "transaction_invoice"])
      .order("issue_date", { ascending: false, nullsFirst: false });

    if (error) return { ok: false, message: error.message };

    const rows: OpenDocument[] = (data || []).map((d: any) => ({
      id: String(d.id),
      document_number: d.document_number ?? null,
      document_type: String(d.document_type),
      total_amount: typeof d.total_amount === "number" ? d.total_amount : d.total_amount ? Number(d.total_amount) : null,
      outstanding_balance:
        typeof d.outstanding_balance === "number"
          ? d.outstanding_balance
          : d.outstanding_balance
            ? Number(d.outstanding_balance)
            : null,
      accounting_status: d.accounting_status ?? null,
      issue_date: d.issue_date ?? null,
    }));

    return { ok: true, data: rows };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export async function createDocumentLinkAction(args: {
  sourceDocumentId: string;
  targetDocumentId: string;
  linkType: DocumentLinkType;
  amount: number;
  note?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id || null;

    if (!args.sourceDocumentId || !args.targetDocumentId) {
      return { ok: false, message: "חסרים מזהי מסמכים לשיוך" };
    }
    if (args.sourceDocumentId === args.targetDocumentId) {
      return { ok: false, message: "לא ניתן לשייך מסמך לעצמו" };
    }

    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: "סכום שיוך לא תקין" };
    }
    if (["payment", "credit", "cancellation"].includes(args.linkType) && amount <= 0) {
      return { ok: false, message: "סכום חייב להיות גדול מ-0 עבור שיוך זה" };
    }

    // Verify both documents belong to the current company
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, company_id")
      .eq("company_id", companyId)
      .in("id", [args.sourceDocumentId, args.targetDocumentId]);

    if (docsError) return { ok: false, message: docsError.message };
    if (!docs || docs.length !== 2) {
      return { ok: false, message: "אחד מהמסמכים לשיוך לא נמצא" };
    }

    const { data, error } = await supabase
      .from("document_links")
      .insert({
        company_id: companyId,
        source_document_id: args.sourceDocumentId,
        target_document_id: args.targetDocumentId,
        link_type: args.linkType,
        amount,
        note: args.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, id: data.id };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export async function deleteDocumentLinkAction(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    if (!args.id) return { ok: false, message: "חסר מזהה שיוך" };

    const { error } = await supabase
      .from("document_links")
      .delete()
      .eq("id", args.id)
      .eq("company_id", companyId);

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Close (cancel) a non-regulatory document.
 * Only allowed for: quote, proforma, work_order, delivery_note, return_note, 
 * purchase_order, self_invoice, self_credit_note.
 */
export async function closeDocumentAction(documentId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const { data: { user } } = await supabase.auth.getUser();

    // Verify document exists and belongs to company
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("document_type, document_status")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (fetchError) {
      return { ok: false as const, message: fetchError.message };
    }
    if (!doc) {
      return { ok: false as const, message: "מסמך לא נמצא" };
    }

    // Only block tax_invoice; all other types are allowed to close
    if (doc.document_type === "tax_invoice") {
      return {
        ok: false as const,
        message: "לא ניתן לסגור חשבונית מס.",
      };
    }

    // Update status to canceled
    const adminClient = createAdminClient();
    const cancellationReason = "closed_by_user";
    const cancelledAt = new Date().toISOString();
    const cancelledBy = user?.id ?? null;

    const { error: updateError } = await adminClient
      .from("documents")
      .update({
        document_status: "cancelled",
        cancellation_reason: cancellationReason,
        cancelled_at: cancelledAt,
        cancelled_by: cancelledBy,
      })
      .eq("id", documentId)
      .eq("company_id", companyId);

    if (updateError) {
      return { ok: false as const, message: updateError.message };
    }

    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

export async function markDocumentCancelledAction(args: {
  documentId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const { data: { user } } = await supabase.auth.getUser();

    if (!args.documentId) return { ok: false, message: "חסר מזהה מסמך" };

    const adminClient = createAdminClient();
    const cancelledAt = new Date().toISOString();
    const cancelledBy = user?.id ?? null;

    const { error } = await adminClient
      .from("documents")
      .update({
        document_status: "cancelled",
        cancellation_reason: args.reason,
        cancelled_at: cancelledAt,
        cancelled_by: cancelledBy,
      })
      .eq("id", args.documentId)
      .eq("company_id", companyId);

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export async function listDocumentLinksAction(args: {
  documentId: string;
}): Promise<{ ok: true; links: DocumentLinkDTO[] } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    if (!args.documentId) return { ok: false, message: "חסר מזהה מסמך" };

    const { data, error } = await supabase
      .from("document_links")
      .select(
        `
          id,
          link_type,
          amount,
          note,
          created_at,
          source:source_document_id(
            id, document_type, document_number, document_status, issue_date, total_amount, customer_name
          ),
          target:target_document_id(
            id, document_type, document_number, document_status, issue_date, total_amount, customer_name
          )
        `
      )
      .eq("company_id", companyId)
      .or(`source_document_id.eq.${args.documentId},target_document_id.eq.${args.documentId}`)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, message: error.message };

    const links: DocumentLinkDTO[] = (data || []).map((row: any) => ({
      id: row.id,
      linkType: row.link_type,
      amount: Number(row.amount || 0),
      note: row.note ?? null,
      createdAt: row.created_at,
      source: {
        id: row.source?.id,
        documentType: row.source?.document_type,
        documentNumber: row.source?.document_number,
        documentStatus: row.source?.document_status,
        issueDate: row.source?.issue_date ?? null,
        totalAmount: Number(row.source?.total_amount || 0),
        customerName: row.source?.customer_name ?? null,
      },
      target: {
        id: row.target?.id,
        documentType: row.target?.document_type,
        documentNumber: row.target?.document_number,
        documentStatus: row.target?.document_status,
        issueDate: row.target?.issue_date ?? null,
        totalAmount: Number(row.target?.total_amount || 0),
        customerName: row.target?.customer_name ?? null,
      },
    }));

    return { ok: true, links };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}
