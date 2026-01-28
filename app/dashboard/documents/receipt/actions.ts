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

export type { PaymentRow, PaymentMethod, ReceiptDraftPayload, ReceiptSettings };
export type InitialReceiptCreateData = InitialDocumentCreateData;

export {
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
};

export async function getInitialReceiptCreateData(): Promise<InitialReceiptCreateData> {
  return getInitialDocumentCreateData("receipt");
}

export async function saveReceiptDraftAction(payload: ReceiptDraftPayload) {
  return saveDocumentDraftAction("receipt", payload);
}

export async function issueReceiptAction(payload: ReceiptDraftPayload, draftId?: string) {
  const result = await issueDocumentAction("receipt", payload, draftId);
  if (!result.ok) return result;
  return {
    ok: true as const,
    receiptId: result.documentId,
    documentNumber: result.documentNumber,
    companyName: result.companyName,
    payload: result.payload,
  };
}

export async function updateReceiptDraftAction(draftId: string, payload: ReceiptDraftPayload) {
  return updateDocumentDraftAction("receipt", draftId, payload);
}

export async function getDraftReceiptForEditAction(draftId: string) {
  return getDraftDocumentForEditAction("receipt", draftId);
}

export async function getReceiptPreviewUrlAction(receiptId: string) {
  return getDocumentPreviewUrlAction("receipt", receiptId);
}
