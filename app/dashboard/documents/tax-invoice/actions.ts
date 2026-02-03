"use server";

import type { TaxInvoiceDraftPayload, InitialTaxInvoiceCreateData } from "@/lib/documents/types";
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
