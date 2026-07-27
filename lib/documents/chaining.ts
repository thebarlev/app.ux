/**
 * Shared rules for a chained ("שרשור") document — one issued from an existing
 * source document, e.g. a receipt for a tax invoice, or a tax invoice for a
 * חשבון עסקה.
 *
 * Client-safe: no server-only imports, so all three document forms share it and
 * cannot drift apart the way they had.
 */

/** Tolerance for money comparisons, in the document currency. */
const MONEY_EPSILON = 0.01

/**
 * Document types that carry real payment rows. Chaining from one of these keeps
 * its payments; chaining from anything else (an invoice, a חשבון עסקה) has no
 * payments to carry, so the chained receipt is opened for the source's total.
 */
const PAYMENT_BEARING_TYPES = new Set(["receipt", "invoice_receipt"])

export function isPaymentBearingDocumentType(documentType: string | null | undefined): boolean {
  return PAYMENT_BEARING_TYPES.has(String(documentType || ""))
}

/**
 * The amount a chained document should open with.
 *
 * Always the source's `total_amount` — the gross, VAT-inclusive figure. This was
 * previously taken from the source's line items, which are net of VAT: an
 * osek murshe issuing a ₪590 invoice (₪500 + 18%) got a ₪500 receipt. For an
 * osek patur there is no VAT, so gross and net are the same number and the same
 * rule gives the right answer without special-casing the business type.
 *
 * The knock-on effect was worse than the wrong number: the link builder only
 * created a "payment" link when the two totals matched exactly, so ₪500 against
 * ₪590 silently degraded to a "related" link with amount 0 and no status ever
 * moved.
 */
export function chainedTotalFromSource(sourceTotalAmount: unknown): number {
  const n = typeof sourceTotalAmount === "number" ? sourceTotalAmount : Number(sourceTotalAmount)
  return Number.isFinite(n) ? n : 0
}

/**
 * Whether the source document was issued with its total rounded.
 *
 * "עיגול לסכום סופי" is a form setting (ReceiptSettings.roundTotals), not a
 * column on the document — so a chained document opened with the company
 * default and recomputed the total from the net base, losing the adjustment. A
 * ₪5,901 invoice became ₪5,901.18, which is a different amount from the one
 * actually issued.
 *
 * It is recoverable from the stored figures: rounding is the only reason
 * total_amount differs from subtotal + vat_amount. Detecting it here means the
 * chained document reproduces the source's total exactly, using the same
 * Math.round the source used, with no schema change.
 */
export function sourceAppliedRounding(source: {
  subtotal?: unknown
  vatAmount?: unknown
  totalAmount?: unknown
}): boolean {
  const subtotal = Number(source.subtotal)
  const vatAmount = Number(source.vatAmount)
  const total = Number(source.totalAmount)
  if (!Number.isFinite(subtotal) || !Number.isFinite(vatAmount) || !Number.isFinite(total)) return false
  // Half an agora of slack, so ordinary float noise is not mistaken for rounding.
  return Math.abs(total - (subtotal + vatAmount)) > MONEY_EPSILON / 2
}

/**
 * A chained document may settle the source in full or in part, but it may never
 * charge more than the source: that would be a new obligation, which needs its
 * own document rather than an amendment of this one.
 */
export function validateChainedAmount(params: {
  chainedTotal: number
  sourceTotal: number
}): { ok: true } | { ok: false; message: string } {
  const chained = Number(params.chainedTotal)
  const source = Number(params.sourceTotal)

  if (!Number.isFinite(chained) || !Number.isFinite(source)) return { ok: true }
  // A source with no total (0) carries no ceiling to enforce.
  if (source <= 0) return { ok: true }
  // Credit/cancellation flows send negative amounts; the ceiling is about
  // over-charging, so only positive amounts are constrained.
  if (chained <= 0) return { ok: true }

  if (chained - source > MONEY_EPSILON) {
    return {
      ok: false,
      message:
        "לא ניתן לחייב מעל סכום המסמך המקורי; לתשלום נוסף הפק מסמך חדש.",
    }
  }

  return { ok: true }
}

/**
 * Builds the document_links row for a chained document.
 *
 * Direction matters and was inverted. `recompute_document_accounting`
 * (scripts/043-fix-conversion-logic.sql) sums payment links by
 * `target_document_id`, so the document being PAID must be the target. The forms
 * were passing the source invoice as `source_document_id` and the new receipt as
 * `target_document_id`, which credited the payment to the receipt — a document
 * that is already closed by definition — and left the invoice at
 * accounting_status 'open' with its full balance outstanding, forever.
 *
 * With the direction corrected the trigger accumulates onto the invoice, so a
 * partial receipt moves it to 'partially_paid' and a full one to 'paid'. The
 * receipt closes on its own via isAlwaysClosedDoc in document-helpers, so both
 * ends settle with no extra logic — and the dead 'conversion' branch in the
 * trigger stays unused, as intended.
 */
export function buildChainedPaymentLink(params: {
  sourceDocumentId: string
  chainedDocumentId: string
  amount: number
  note?: string | null
}): {
  sourceDocumentId: string
  targetDocumentId: string
  linkType: "payment"
  amount: number
  note: string | null
} {
  return {
    // The payment originates at the chained document (the receipt)...
    sourceDocumentId: params.chainedDocumentId,
    // ...and settles the document it was issued for.
    targetDocumentId: params.sourceDocumentId,
    linkType: "payment",
    amount: Number(params.amount) || 0,
    note: params.note ?? null,
  }
}
