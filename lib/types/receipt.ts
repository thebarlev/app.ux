/**
 * Centralized Receipt Type Definitions
 * 
 * This file contains all TypeScript types related to receipts.
 * Import from here to ensure consistency across the codebase.
 */

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
 * Contains all possible payment fields for different payment methods
 */
export type PaymentRow = {
  method: PaymentMethod | "";
  date: string; // YYYY-MM-DD format
  amount: number;
  currency: string;
  
  // Bank transfer fields (stored in document_line_items.bank_name, branch, account_number)
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  
  // Credit card fields (stored in payment_metadata JSONB)
  cardInstallments?: number;
  cardDealType?: string; // "regular" | "payments" | "credit" | "deferred"
  cardType?: string; // "visa" | "mastercard" | "isracard" | "amex" | "diners" | "other"
  cardLastDigits?: string;
  
  // Bank transfer additional fields (stored in payment_metadata JSONB)
  bankAccount?: string;
  bankBranch?: string;
  
  // Check fields (stored in payment_metadata JSONB)
  checkBank?: string;
  checkBranch?: string;
  checkAccount?: string;
  checkNumber?: string;
  
  // Digital wallet / simple payment fields (stored in payment_metadata JSONB)
  payerAccount?: string;
  transactionReference?: string;
  
  // Other deduction description (stored in payment_metadata JSONB)
  description?: string;
};

/**
 * Receipt draft payload for server actions
 * Used when saving or updating drafts
 */
export type ReceiptDraftPayload = {
  documentType: "receipt";
  customerName: string;
  customerId?: string | null; // Link to customers table
  documentDate: string; // YYYY-MM-DD
  description: string; // Receipt description (document_description column)
  payments: PaymentRow[];
  notes: string; // internal_notes column
  footerNotes: string; // customer_notes column
  currency: string;
  total: number;
  roundTotals: boolean;
  language: "he" | "en";
};

/**
 * Receipt data for PDF generation (jsPDF)
 * Used by lib/pdf-generator.ts
 */
export type ReceiptPDFData = {
  documentNumber: string;
  issueDate: string; // YYYY-MM-DD or ISO format
  customerName: string;
  customerDetails?: {
    email?: string;
    phone?: string;
    mobile?: string;
    address?: string;
  };
  companyName: string;
  companyDetails?: {
    businessType?: string;
    registrationNumber?: string;
    address?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
  };
  total: number;
  currency: string;
  payments: Array<{
    method: string;
    date: string;
    amount: number;
    currency: string;
    bankName?: string;
    branch?: string;
    accountNumber?: string;
  }>;
  notes?: string; // internal_notes
  footerNotes?: string; // customer_notes
  description?: string; // document_description
};

/**
 * Receipt list item (from database query)
 * Used in receipt list view
 */
export type ReceiptListItem = {
  id: string;
  document_number: string | null;
  document_status: "draft" | "final" | "cancelled" | "voided";
  issue_date: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  created_at: string;
  finalized_at: string | null;
};

/**
 * Receipt settings (company preferences)
 * Used in receipt form initialization
 */
export type ReceiptSettings = {
  allowedCurrencies: string[];
  defaultCurrency: string;
  language: "he" | "en";
  roundTotals: boolean;
};

/**
 * Extended payment metadata for JSONB storage
 * Fields that don't fit in standard columns
 */
export type PaymentMetadata = {
  // Credit card
  cardInstallments?: number;
  cardDealType?: string;
  cardType?: string;
  cardLastDigits?: string;
  
  // Bank transfer
  bankAccount?: string;
  bankBranch?: string;
  
  // Check
  checkBank?: string;
  checkBranch?: string;
  checkAccount?: string;
  checkNumber?: string;
  
  // Digital wallet
  payerAccount?: string;
  transactionReference?: string;
  
  // Other
  description?: string;
};

/**
 * Document line item as stored in database
 * Maps to document_line_items table
 */
export type DocumentLineItem = {
  id: string;
  document_id: string;
  company_id: string;
  line_number: number;
  description: string; // Payment method name
  item_date: string; // Payment date
  unit_price: number; // Payment amount
  quantity: number; // Always 1 for payments
  line_total: number; // Same as unit_price for payments
  currency: string;
  
  // Bank transfer fields (direct columns)
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  
  // Extended fields (JSONB)
  payment_metadata: PaymentMetadata | null;
  
  created_at: string;
  updated_at: string;
};

/**
 * Helper: Convert PaymentRow to DocumentLineItem insert data
 */
export function paymentRowToLineItem(
  payment: PaymentRow,
  documentId: string,
  companyId: string,
  lineNumber: number
): Omit<DocumentLineItem, "id" | "created_at" | "updated_at"> {
  // Extract metadata fields (everything except bank transfer basic fields)
  const metadata: PaymentMetadata = {};
  
  if (payment.cardInstallments) metadata.cardInstallments = payment.cardInstallments;
  if (payment.cardDealType) metadata.cardDealType = payment.cardDealType;
  if (payment.cardType) metadata.cardType = payment.cardType;
  if (payment.cardLastDigits) metadata.cardLastDigits = payment.cardLastDigits;
  
  if (payment.bankAccount) metadata.bankAccount = payment.bankAccount;
  if (payment.bankBranch) metadata.bankBranch = payment.bankBranch;
  
  if (payment.checkBank) metadata.checkBank = payment.checkBank;
  if (payment.checkBranch) metadata.checkBranch = payment.checkBranch;
  if (payment.checkAccount) metadata.checkAccount = payment.checkAccount;
  if (payment.checkNumber) metadata.checkNumber = payment.checkNumber;
  
  if (payment.payerAccount) metadata.payerAccount = payment.payerAccount;
  if (payment.transactionReference) metadata.transactionReference = payment.transactionReference;
  
  if (payment.description) metadata.description = payment.description;
  
  return {
    document_id: documentId,
    company_id: companyId,
    line_number: lineNumber,
    description: payment.method || "תשלום",
    item_date: payment.date,
    unit_price: payment.amount,
    quantity: 1,
    line_total: payment.amount,
    currency: payment.currency,
    bank_name: payment.bankName || null,
    branch: payment.branch || null,
    account_number: payment.accountNumber || null,
    payment_metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

/**
 * Helper: Convert DocumentLineItem to PaymentRow for form
 */
export function lineItemToPaymentRow(item: DocumentLineItem): PaymentRow {
  const payment: PaymentRow = {
    method: (item.description as PaymentMethod) || "",
    date: item.item_date,
    amount: item.line_total || item.unit_price || 0,
    currency: item.currency,
  };
  
  // Map direct columns
  if (item.bank_name) payment.bankName = item.bank_name;
  if (item.branch) payment.branch = item.branch;
  if (item.account_number) payment.accountNumber = item.account_number;
  
  // Map metadata
  if (item.payment_metadata) {
    const meta = item.payment_metadata;
    
    if (meta.cardInstallments) payment.cardInstallments = meta.cardInstallments;
    if (meta.cardDealType) payment.cardDealType = meta.cardDealType;
    if (meta.cardType) payment.cardType = meta.cardType;
    if (meta.cardLastDigits) payment.cardLastDigits = meta.cardLastDigits;
    
    if (meta.bankAccount) payment.bankAccount = meta.bankAccount;
    if (meta.bankBranch) payment.bankBranch = meta.bankBranch;
    
    if (meta.checkBank) payment.checkBank = meta.checkBank;
    if (meta.checkBranch) payment.checkBranch = meta.checkBranch;
    if (meta.checkAccount) payment.checkAccount = meta.checkAccount;
    if (meta.checkNumber) payment.checkNumber = meta.checkNumber;
    
    if (meta.payerAccount) payment.payerAccount = meta.payerAccount;
    if (meta.transactionReference) payment.transactionReference = meta.transactionReference;
    
    if (meta.description) payment.description = meta.description;
  }
  
  return payment;
}
