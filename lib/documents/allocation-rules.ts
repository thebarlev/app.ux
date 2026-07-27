/**
 * Which documents are subject to ITA's allocation-number regime.
 *
 * Only a tax invoice and an invoice-receipt are. Everything else the system
 * issues — חשבון עסקה (proforma), הצעת מחיר, תעודת משלוח, הזמנת עבודה, קבלה,
 * הזמנת רכש — is outside the regime entirely: no allocation number is requested,
 * and therefore nothing about them requires a customer ח.פ/ת.ז *for allocation
 * purposes*, at any amount.
 *
 * This lives in one place because the rule is applied twice: as a pre-flight
 * check in the shared document form, and as the gate around the SHAAM block in
 * finalizeDocument. Those two had drifted — the server gate was correctly
 * limited to the two supervised types while the form applied the ">₪5,000 needs
 * a customer ID" rule to every document type it renders, so a חשבון עסקה over
 * the threshold demanded an ID that would never be used.
 *
 * Client-safe: no server-only imports, so the form and the server share it.
 */

/**
 * Accepts both spellings in use: the form's DocumentIssueType ("invoiceReceipt")
 * and the database's document_type ("invoice_receipt").
 */
const ALLOCATION_SUPERVISED_TYPES = new Set(["tax_invoice", "invoiceReceipt", "invoice_receipt"])

/**
 * True when this document type can ever require an ITA allocation number.
 * Amount is NOT considered here — this is purely "is this type in the regime".
 */
export function isAllocationSupervisedDocumentType(documentType: string | null | undefined): boolean {
  if (!documentType) return false
  return ALLOCATION_SUPERVISED_TYPES.has(String(documentType))
}

/**
 * Statutory threshold, on the amount BEFORE VAT, strictly greater-than
 * (exactly ₪5,000 is exempt). Used by the form for an immediate inline error;
 * the server remains authoritative and reads the live value from
 * global_settings.invoice_allocation_threshold_ils.
 */
export const ALLOCATION_THRESHOLD_ILS = 5000

/**
 * Whether a customer ח.פ/ת.ז is required *for allocation purposes* on this
 * document. Returns false for every unsupervised type regardless of amount.
 */
export function requiresCustomerTaxIdForAllocation(params: {
  documentType: string | null | undefined
  subtotalBeforeVat: number
  thresholdIls?: number
}): boolean {
  if (!isAllocationSupervisedDocumentType(params.documentType)) return false
  const threshold = Number.isFinite(params.thresholdIls as number)
    ? (params.thresholdIls as number)
    : ALLOCATION_THRESHOLD_ILS
  return Number.isFinite(params.subtotalBeforeVat) && params.subtotalBeforeVat > threshold
}
