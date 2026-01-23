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

export type TaxInvoiceDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: "tax_invoice";
  items?: TaxInvoiceItemRow[];
  vatType?: "regular" | "no_vat";
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
};

export type InitialTaxInvoiceCreateData = InitialDocumentCreateData;

export {
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
};

export async function getInitialTaxInvoiceCreateData(): Promise<InitialTaxInvoiceCreateData> {
  return getInitialDocumentCreateData("tax_invoice");
}

export async function saveTaxInvoiceDraftAction(payload: TaxInvoiceDraftPayload) {
  return saveDocumentDraftAction("tax_invoice", payload);
}

export async function issueTaxInvoiceAction(payload: TaxInvoiceDraftPayload) {
  return issueDocumentAction("tax_invoice", payload);
}

export async function updateTaxInvoiceDraftAction(draftId: string, payload: TaxInvoiceDraftPayload) {
  return updateDocumentDraftAction("tax_invoice", draftId, payload);
}

export async function getDraftTaxInvoiceForEditAction(draftId: string) {
  return getDraftDocumentForEditAction("tax_invoice", draftId);
}

export async function getTaxInvoicePreviewUrlAction(documentId: string) {
  return getDocumentPreviewUrlAction("tax_invoice", documentId);
}
