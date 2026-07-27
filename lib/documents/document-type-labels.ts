/**
 * Hebrew labels keyed by the DATABASE document_type value.
 *
 * Client-safe and dependency-free, so it can be used from the document forms.
 * Note the existing DOCUMENT_TYPE_LABELS in lib/documents/actions.ts is keyed by
 * DocumentIssueType ("invoiceReceipt"), while document rows and the chaining
 * payload carry the DB spelling ("invoice_receipt") — this map covers the latter.
 */
export const DOCUMENT_TYPE_LABELS_HE: Record<string, string> = {
  tax_invoice: "חשבונית מס",
  invoice_receipt: "חשבונית מס / קבלה",
  receipt: "קבלה",
  credit_note: "חשבונית זיכוי",
  proforma: "חשבון עסקה",
  quote: "הצעת מחיר",
  work_order: "הזמנת עבודה",
  delivery_note: "תעודת משלוח",
  return_note: "תעודת החזרה",
  purchase_order: "הזמנת רכש",
  self_invoice: "חשבונית עצמית",
  self_credit_note: "חשבונית זיכוי עצמית",
  transaction_invoice: "חשבונית עסקה",
}
