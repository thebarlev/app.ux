"use server";

import type { InvoiceReceiptDraftPayload, InitialInvoiceReceiptCreateData } from "@/lib/documents/types";
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
} from "@/lib/documents/actions";

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
