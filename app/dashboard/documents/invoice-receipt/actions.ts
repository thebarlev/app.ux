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
  type InitialDocumentCreateData,
  type PaymentRow,
  type PaymentMethod,
  type ReceiptSettings,
} from "@/lib/documents/actions";

export type { PaymentRow, PaymentMethod, ReceiptSettings };

export type InvoiceReceiptItemRow = {
  label: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  vatMode: "before" | "included";
  lineTotal: number;
};

export type InvoiceReceiptDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: "invoiceReceipt";
  items?: InvoiceReceiptItemRow[];
  vatType?: "regular" | "no_vat";
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

export type InitialInvoiceReceiptCreateData = InitialDocumentCreateData;

export {
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
};

export async function getInitialInvoiceReceiptCreateData(): Promise<InitialInvoiceReceiptCreateData> {
  return getInitialDocumentCreateData("invoiceReceipt");
}

export async function saveInvoiceReceiptDraftAction(payload: InvoiceReceiptDraftPayload) {
  return saveDocumentDraftAction("invoiceReceipt", payload);
}

export async function issueInvoiceReceiptAction(payload: InvoiceReceiptDraftPayload) {
  return issueDocumentAction("invoiceReceipt", payload);
}

export async function updateInvoiceReceiptDraftAction(draftId: string, payload: InvoiceReceiptDraftPayload) {
  return updateDocumentDraftAction("invoiceReceipt", draftId, payload);
}

export async function getDraftInvoiceReceiptForEditAction(draftId: string) {
  return getDraftDocumentForEditAction("invoiceReceipt", draftId);
}

export async function getInvoiceReceiptPreviewUrlAction(documentId: string) {
  return getDocumentPreviewUrlAction("invoiceReceipt", documentId);
}
