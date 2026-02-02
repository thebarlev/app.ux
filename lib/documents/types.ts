/**
 * Shared Document Types
 * 
 * Central location for types used across document-related files.
 * These types need to be accessible from both server actions and client components.
 */

/**
 * Document issue type (all supported document types)
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

/**
 * VAT type options
 */
export type VatType = "regular" | "no_vat";

/**
 * Tax invoice item row
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
 * Payment method options for receipts
 */
export type PaymentMethod =
  | "העברה בנקאית"
  | "Bit"
  | "PayBox"
  | "כרטיס אשראי"
  | "מזומן"
  | "צ׳ק"
  | "PayPal"
  | "Payoneer"
  | "Google Pay"
  | "Apple Pay"
  | "ביטקוין"
  | "אתריום"
  | "שובר BuyME"
  | "שובר מתנה"
  | "שווה כסף"
  | "V-CHECK"
  | "Colu"
  | "Pay"
  | "ניכוי במקור"
  | "ניכוי חלק עובד טל״א"
  | "ניכוי אחר";

/**
 * Payment row in receipt form
 */
export type PaymentRow = {
  method: PaymentMethod | "";
  date: string;
  amount: number;
  currency: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  cardInstallments?: number;
  cardDealType?: string;
  cardType?: string;
  cardLastDigits?: string;
  bankAccount?: string;
  bankBranch?: string;
  checkBank?: string;
  checkBranch?: string;
  checkAccount?: string;
  checkNumber?: string;
  payerAccount?: string;
  transactionReference?: string;
  description?: string;
};

/**
 * Receipt draft payload for server actions
 */
export type ReceiptDraftPayload = {
  documentType: "receipt";
  customerName: string;
  customerId?: string | null;
  documentDate: string;
  description: string;
  payments: PaymentRow[];
  notes: string;
  currency: string;
  total: number;
  roundTotals: boolean;
  language: "he" | "en";
  allowNegativePayments?: boolean;
};

/**
 * Receipt settings (company preferences)
 */
export type ReceiptSettings = {
  allowedCurrencies: string[];
  defaultCurrency: string;
  currency?: string;
  language: "he" | "en";
  roundTotals: boolean;
};

/**
 * Initial document create data returned from server
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
      settings: ReceiptSettings;
      minAllowedDate: string | null;
      vatRate?: number;
    }
  | { ok: false; message: string };

/**
 * Document draft payload (extended from receipt with items)
 */
export type DocumentDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: DocumentIssueType;
  items?: TaxInvoiceItemRow[];
  vatType?: VatType;
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

/**
 * Credit note item row
 */
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

/**
 * Credit note draft payload
 */
export type CreditNoteDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: "creditNote";
  items?: CreditNoteItemRow[];
  vatType?: "regular" | "no_vat";
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

/**
 * Tax invoice draft payload
 */
export type TaxInvoiceDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: "tax_invoice";
  items?: TaxInvoiceItemRow[];
  vatType?: "regular" | "no_vat";
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

/**
 * Invoice receipt item row
 */
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

/**
 * Invoice receipt draft payload
 */
export type InvoiceReceiptDraftPayload = Omit<ReceiptDraftPayload, "documentType"> & {
  documentType: "invoiceReceipt";
  items?: InvoiceReceiptItemRow[];
  vatType?: "regular" | "no_vat";
  vatRate?: number;
  vatAmount?: number;
  subtotal?: number;
  paymentDueDate?: string;
};

/**
 * Type alias for initial create data
 */
export type InitialReceiptCreateData = InitialDocumentCreateData;
export type InitialCreditNoteCreateData = InitialDocumentCreateData;
export type InitialTaxInvoiceCreateData = InitialDocumentCreateData;
export type InitialInvoiceReceiptCreateData = InitialDocumentCreateData;

/**
 * Documents list filters
 */
export type DocumentsListFilters = {
  search?: string;
  documentType?: string;
  documentStatusFilter?: "all" | "draft" | "nonDraft";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Document list item
 */
export type DocumentListItem = {
  id: string;
  document_number: string | null;
  document_type: string;
  document_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  document_description: string | null;
  payment_method: string | null;
  total_amount: number | null;
  currency: string | null;
  document_status: string;
  accounting_status?: string | null;
  paid_amount?: number | null;
  credited_amount?: number | null;
  outstanding_balance?: number | null;
  reference_text?: string | null;
  has_outgoing_credit_link?: boolean;
  credited_by_credit_amount?: number | null;
  is_canceled_by_credit?: boolean;
  created_at: string;
};

/**
 * Documents list result
 */
export type DocumentsListResult = {
  companyId: string;
  documents: DocumentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

/**
 * Document link types
 */
export type DocumentLinkType = "payment" | "credit" | "conversion" | "cancellation" | "related";

export type DocumentLinkDTO = {
  id: string;
  source_document_id: string;
  target_document_id: string;
  link_type: DocumentLinkType;
  metadata?: Record<string, any>;
  created_at: string;
};

/**
 * Open document for UI display
 */
export type OpenDocument = {
  id: string;
  document_number: string;
  document_type: string;
  document_date: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  status: string;
  accounting_status?: string | null;
  outstanding_balance?: number | null;
};

