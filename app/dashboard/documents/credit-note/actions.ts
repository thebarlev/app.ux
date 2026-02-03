"use server";

import type { ReceiptDraftPayload, CreditNoteDraftPayload, InitialCreditNoteCreateData } from "@/lib/documents/types";
import {
  getInitialDocumentCreateData,
  saveDocumentDraftAction,
  issueDocumentAction,
  updateDocumentDraftAction,
  getDraftDocumentForEditAction,
  getDocumentPreviewUrlAction,
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
  createDocumentLinkAction,
  markDocumentCancelledAction,
} from "@/lib/documents/actions";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";

export {
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
};

export async function getInitialCreditNoteCreateData(): Promise<InitialCreditNoteCreateData> {
   return getInitialDocumentCreateData("creditNote");
 }
 
 export async function saveCreditNoteDraftAction(payload: CreditNoteDraftPayload) {
   return saveDocumentDraftAction("creditNote", payload);
 }
 
 export async function issueCreditNoteAction(payload: CreditNoteDraftPayload) {
   return issueDocumentAction("creditNote", payload);
 }
 
 export async function updateCreditNoteDraftAction(draftId: string, payload: CreditNoteDraftPayload) {
   return updateDocumentDraftAction("creditNote", draftId, payload);
 }
 
 export async function getDraftCreditNoteForEditAction(draftId: string) {
   return getDraftDocumentForEditAction("creditNote", draftId);
 }
 
 export async function getCreditNotePreviewUrlAction(documentId: string) {
   return getDocumentPreviewUrlAction("creditNote", documentId);
 }

export async function issueNegativeReceiptForInvoiceReceiptAction(args: {
  sourceDocumentId: string;
  customerId?: string | null;
  customerName?: string | null;
  currency?: string | null;
  total: number;
  documentDate: string;
  language: "he" | "en";
  roundTotals: boolean;
}) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();
    const { data: source, error } = await supabase
      .from("documents")
      .select("id, document_type, document_number, document_description, customer_id, customer_name, currency, issue_date, total_amount")
      .eq("company_id", companyId)
      .eq("id", args.sourceDocumentId)
      .single();
    if (error || !source) {
      return { ok: false as const, message: error?.message || "Source document not found" };
    }
    if (source.document_type !== "invoice_receipt") {
      return { ok: false as const, message: "Source document is not invoice_receipt" };
    }
    const label = "חשבונית מס / קבלה";
    const number = source.document_number || "";
    const noteText = `ביטול ${label} ${number}`.trim();
    const amountAbs = Math.abs(Number.isFinite(args.total) ? args.total : Number(source.total_amount || 0));
    const negativeAmount = -amountAbs;
    const documentDate = args.documentDate || (source.issue_date as any) || new Date().toISOString().slice(0, 10);
    const currency = args.currency || source.currency || "₪";
    const customerId = args.customerId ?? source.customer_id ?? null;
    const customerName = (args.customerName ?? source.customer_name ?? "").toString();
    const description = noteText;

    const round2 = (n: number) => Number(n.toFixed(2));

    let payments: ReceiptDraftPayload["payments"] = [
      {
        method: "מזומן",
        date: documentDate,
        amount: negativeAmount,
        currency,
      },
    ];

    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("description, item_date, line_total, currency, bank_name, branch, account_number, payment_metadata")
      .eq("document_id", args.sourceDocumentId)
      .order("line_number");

    if (lineItems && lineItems.length > 0) {
      // NOTE:
      // For invoice_receipt documents, document_line_items are *items* (net/subtotal before VAT),
      // not payment rows. We still reuse them to preserve the current receipt "rows" shape,
      // but we scale amounts so the negative receipt total matches the source TOTAL כולל מע״מ.
      const absLineTotals = lineItems.map((item: any) => {
        const amt = typeof item.line_total === "number" ? item.line_total : Number(item.line_total || 0);
        return Math.abs(Number.isFinite(amt) ? amt : 0);
      });
      const sumAbs = absLineTotals.reduce((acc: number, n: number) => acc + n, 0);
      const ratio = sumAbs > 0 ? amountAbs / sumAbs : 0;

      let allocatedAbs = 0;
      payments = lineItems.map((item: any, idx: number) => {
        const metadata = item.payment_metadata || {};
        const amtRaw = typeof item.line_total === "number" ? item.line_total : Number(item.line_total || 0);
        const baseAbs = Math.abs(Number.isFinite(amtRaw) ? amtRaw : 0);

        let scaledAbs = 0;
        if (sumAbs > 0) {
          const isLast = idx === lineItems.length - 1;
          if (isLast) {
            scaledAbs = round2(Math.max(0, amountAbs - allocatedAbs));
          } else {
            scaledAbs = round2(baseAbs * ratio);
            allocatedAbs += scaledAbs;
          }
        }
        return {
          method: item.description || "מזומן",
          date: item.item_date || documentDate,
          amount: -Math.abs(scaledAbs),
          currency: item.currency || currency,
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


    const payload: ReceiptDraftPayload = {
      documentType: "receipt",
      customerName,
      customerId,
      documentDate,
      description,
      payments,
      notes: noteText,
      currency,
      // Must match TOTAL כולל מע״מ for invoiceReceipt cancellations
      total: negativeAmount,
      roundTotals: args.roundTotals,
      language: args.language,
      allowNegativePayments: true,
    };

    const receiptRes = await issueDocumentAction("receipt", payload);
    if (!receiptRes.ok) {
      return { ok: false as const, message: receiptRes.message || "Failed to issue negative receipt" };
    }

    const linkRes = await createDocumentLinkAction({
      sourceDocumentId: receiptRes.documentId,
      targetDocumentId: args.sourceDocumentId,
      linkType: "cancellation",
      amount: amountAbs,
      note: noteText,
    });


    if (!linkRes.ok) {
      return { ok: false as const, message: linkRes.message || "Failed to link cancellation receipt" };
    }

    const cancelRes = await markDocumentCancelledAction({
      documentId: args.sourceDocumentId,
      reason: "cancelled_by_credit",
    });
    if (!cancelRes.ok) {
      return { ok: false as const, message: cancelRes.message || "Failed to update source status" };
    }

    return {
      ok: true as const,
      receiptId: receiptRes.documentId,
      receiptNumber: receiptRes.documentNumber || "",
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}
