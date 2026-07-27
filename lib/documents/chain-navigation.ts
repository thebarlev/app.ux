import type { ChainNewDocumentKind } from "@/components/documents/ChainNewDocumentDialog"

/**
 * Where a "issue a new document from this one" action navigates to, and with
 * what prefill parameters.
 *
 * Extracted from DocumentsListClient so the dashboard's actions column can offer
 * the same document-type picker and land on the same forms with the same
 * parameters, rather than growing a second, drifting copy of this mapping.
 *
 * Client-safe: no server-only imports.
 */

const TARGET_LABELS: Record<Exclude<ChainNewDocumentKind, "credit_note">, string> = {
  deliveryNote: "תעודת משלוח",
  tax_invoice: "חשבונית מס",
  invoiceReceipt: "חשבונית מס / קבלה",
  receipt: "קבלה",
}

/** Strips a parenthetical suffix, e.g. "חשבון עסקה (דרישת תשלום)" -> "חשבון עסקה". */
export function stripParenSuffix(label: string): string {
  return String(label || "").replace(/\s*\([^)]*\)\s*$/, "").trim()
}

export type ChainSourceDocument = {
  id: string
  document_type: string
  document_number?: string | null
  customer_id?: string | null
  customer_name?: string | null
}

/**
 * Builds the target URL for a chained document, including the prefill params the
 * forms read: sourceDocumentId, customerId, customerName and notes.
 *
 * Returns null for credit_note, which has its own dedicated flow.
 */
export function buildChainTargetHref(
  kind: ChainNewDocumentKind,
  source: ChainSourceDocument,
  sourceTypeLabel: string
): string | null {
  if (!source?.id) return null
  if (kind === "credit_note") return null

  const targetLabel = TARGET_LABELS[kind]
  const sourceLabel = stripParenSuffix(sourceTypeLabel)
  const sourceNumber = source.document_number || ""
  const autoNotes = `${targetLabel} עבור ${sourceLabel} ${sourceNumber}`.trim()

  const params = new URLSearchParams()
  params.set("sourceDocumentId", source.id)
  if (source.customer_id) params.set("customerId", String(source.customer_id))
  if (source.customer_name) params.set("customerName", String(source.customer_name))
  if (sourceNumber) params.set("notes", autoNotes)

  const qs = params.toString()
  if (kind === "receipt") return `/dashboard/incomes/documents/new/receipt?${qs}`
  if (kind === "invoiceReceipt") return `/dashboard/incomes/documents/new/invoiceReceipt?${qs}`
  if (kind === "tax_invoice") return `/dashboard/incomes/documents/new/invoice?${qs}`
  return `/business/documents/new/deliveryNote?${qs}`
}
