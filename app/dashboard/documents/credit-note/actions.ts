 "use server";
 
 import type { ReceiptDraftPayload } from "@/lib/types/receipt";
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
   type InitialDocumentCreateData,
   type PaymentRow,
   type PaymentMethod,
   type ReceiptSettings,
 } from "@/lib/documents/actions";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
 
 export type { PaymentRow, PaymentMethod, ReceiptSettings };
 
 export type CreditNoteItemRow = {
   label: string;
   sku: string;
   description: string;
   quantity: number;
   unitPrice: number;
   currency: string;
   vatMode: "before" | "included";
   lineTotal: number;
 };
 
 export type CreditNoteDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
   documentType: "creditNote";
   items?: CreditNoteItemRow[];
   vatType?: "regular" | "no_vat";
   vatRate?: number;
   vatAmount?: number;
   subtotal?: number;
   paymentDueDate?: string;
 };
 
 export type InitialCreditNoteCreateData = InitialDocumentCreateData;
 
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
      payments = lineItems.map((item: any) => {
        const metadata = item.payment_metadata || {};
        const amt = typeof item.line_total === "number" ? item.line_total : Number(item.line_total || 0);
        return {
          method: item.description || "מזומן",
          date: item.item_date || documentDate,
          amount: -Math.abs(amt),
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
      total: -Math.abs(
        payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0)
      ),
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
