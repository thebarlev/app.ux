/**
 * The issuer's tax identifier, resolved one way everywhere.
 *
 * There were two orders in the codebase for the same fact. document-helpers
 * sent `tax_id || registration_number || company_number` to the ITA, while the
 * PDF printed `registration_number || company_number` and never looked at
 * tax_id. With only one company populating tax_id the two agreed by accident —
 * until that company issued an invoice, and the document showed one number
 * while the allocation behind it was granted under another.
 *
 * The order below is the one the ITA has already granted allocations under, so
 * aligning the document to it closes the gap without invalidating anything
 * already filed. Reversing it would have meant those filings were wrong.
 *
 * Returns the raw stored value: callers that need it as a number (the ITA
 * payload) strip non-digits themselves.
 *
 * NOTE: lib/document-helpers.ts still spells this order out inline, deliberately
 * left alone for now. It is the same order; migrate it here when that file is
 * next touched, so there is one definition rather than two that agree.
 */
export function resolveIssuerTaxId(company: {
  tax_id?: string | null
  registration_number?: string | null
  company_number?: string | null
} | null | undefined): string | null {
  if (!company) return null
  const first = [company.tax_id, company.registration_number, company.company_number]
    .map((v) => (v == null ? "" : String(v).trim()))
    .find((v) => v.length > 0)
  return first || null
}
