/**
 * Shared document-related types (non-runtime).
 *
 * IMPORTANT: This file is intentionally NOT a server-action module.
 * It may be imported by both server and client code via `import type`.
 */

export type { PaymentMethod, PaymentRow, ReceiptDraftPayload, ReceiptSettings } from "@/lib/types/receipt";

/**
 * Document issue types supported by the app.
 */
export type DocumentIssueType =
  | "receipt"
  | "tax_invoice"
  | "invoiceReceipt"
  | "creditNote"
  | "quote"
  | "proforma"
  | "workOrder"
  | "deliveryNote"
  | "returnNote"
  | "purchaseOrder"
  | "selfInvoice"
  | "selfCreditNote";

export type VatType = "regular" | "no_vat";

/**
 * Item row used for item-based documents (tax invoice / etc).
 * Kept compatible with existing form components.
 */
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

/**
 * Lightweight row for "open documents" selection dialogs.
 * Matches `getOpenDocumentsByCustomer`.
 */
export type OpenDocument = {
  id: string;
  document_number: string | null;
  document_type: string;
  total_amount: number | null;
  outstanding_balance: number | null;
  accounting_status: string | null;
  issue_date: string | null;
};

/**
 * Generic draft payload used by document actions.
 */
export type DocumentDraftPayload = Omit<import("@/lib/types/receipt").ReceiptDraftPayload, "documentType"> & {
  documentType: DocumentIssueType;
  items?: TaxInvoiceItemRow[];
  vatType?: VatType;
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

/**
 * Initial data returned for document creation pages.
 * This matches `getInitialDocumentCreateData`.
 */
export type InitialDocumentCreateData =
  | {
      ok: true;
      companyId: string;
      companyName: string | null;
      sequenceLocked: boolean;
      previewNumber: string | null;
      draftId?: string | null;
      draftOrigin?: "existing" | "new";
      settings: import("@/lib/types/receipt").ReceiptSettings;
      minAllowedDate: string | null;
      vatRate?: number;
    }
  | { ok: false; message: string };

// Convenience aliases used by route-level actions/modules
export type InitialReceiptCreateData = InitialDocumentCreateData;
export type InitialTaxInvoiceCreateData = InitialDocumentCreateData;
export type InitialInvoiceReceiptCreateData = InitialDocumentCreateData;
export type InitialCreditNoteCreateData = InitialDocumentCreateData;

export type TaxInvoiceDraftPayload = DocumentDraftPayload & { documentType: "tax_invoice" };
export type InvoiceReceiptDraftPayload = DocumentDraftPayload & { documentType: "invoiceReceipt" };
export type CreditNoteDraftPayload = DocumentDraftPayload & { documentType: "creditNote" };

