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
