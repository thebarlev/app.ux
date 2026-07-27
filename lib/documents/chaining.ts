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
 * What a chained receipt should open for: the source's remaining balance when it
 * is known, otherwise its gross total. Opening for the remainder means the
 * common case — settle what is left — needs no edit and cannot overshoot.
 */
export function chainedRemainingFromSource(source: {
  totalAmount?: unknown
  outstandingBalance?: unknown
}): number {
  const total = chainedTotalFromSource(source.totalAmount)
  const raw = source.outstandingBalance
  if (raw === null || raw === undefined) return total
  const remaining = Number(raw)
  if (!Number.isFinite(remaining)) return total
  // Never open for a negative or zero remainder; the cap will refuse it anyway
  // and a 0 receipt is not useful.
  return remaining > 0 ? remaining : total
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
  /** Source's total. Used only as a fallback when the balance is unknown. */
  sourceTotal: number
  /**
   * What is still owed on the source: documents.outstanding_balance, kept up to
   * date by recompute_document_accounting. When present this is the real
   * ceiling, because it already accounts for every receipt issued so far.
   */
  sourceRemaining?: number | null
}): { ok: true } | { ok: false; message: string } {
  const chained = Number(params.chainedTotal)
  const total = Number(params.sourceTotal)

  if (!Number.isFinite(chained)) return { ok: true }
  // Credit/cancellation flows send negative amounts; the ceiling is about
  // over-charging, so only positive amounts are constrained.
  if (chained <= 0) return { ok: true }

  // The ceiling is the REMAINING balance, not the source total. Checking against
  // the total let a second receipt pass on its own merits while the running sum
  // exceeded the invoice — production has tax_invoice#1002 at total 472 with
  // 474 collected across two receipts, i.e. income with no invoice behind it.
  const remainingRaw = params.sourceRemaining
  const remaining =
    remainingRaw === null || remainingRaw === undefined || !Number.isFinite(Number(remainingRaw))
      ? total
      : Number(remainingRaw)

  // A source with nothing outstanding carries no ceiling to enforce here
  // (0 total), but one already settled must not take more.
  if (!Number.isFinite(remaining)) return { ok: true }
  if (total <= 0 && remaining <= 0) return { ok: true }

  if (remaining <= 0) {
    return {
      ok: false,
      message: "המסמך המקורי כבר שולם במלואו. לתשלום נוסף הפק מסמך חדש.",
    }
  }

  if (chained - remaining > MONEY_EPSILON) {
    return {
      ok: false,
      message: `הסכום חורג מיתרת המסמך המקורי — נותרו ${formatMoneyIls(remaining)}. לתשלום נוסף הפק מסמך חדש.`,
    }
  }

  return { ok: true }
}

/** ₪ with thousands separators, two decimals only when they carry information. */
function formatMoneyIls(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const s = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2)
  return `₪${s.replace(/\B(?=(\d{3})+(?!\d))/, ",")}`
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

/**
 * Document types that are a payment demand: they are superseded the moment a
 * real accounting document is issued for them, whether or not anyone has paid.
 */
const SUPERSEDED_BY_INVOICE_TYPES = new Set(["proforma"])

/** Document types that supersede a payment demand when issued for it. */
const SUPERSEDING_TYPES = new Set(["tax_invoice", "invoice_receipt"])

/**
 * True when issuing `targetType` for `sourceType` replaces the source outright.
 *
 * A חשבון עסקה is a request for payment; once a tax invoice is issued against
 * it, the invoice is the document of record and the חשבון עסקה is handled — it
 * should not sit "open" waiting for a payment that will be recorded against the
 * invoice instead. recompute_document_accounting already implements this via the
 * 'conversion' link branch (scripts/043), which marks the SOURCE 'converted'
 * (or 'paid' when the target is an invoice_receipt). That branch existed but no
 * code ever created a conversion link, so it never ran.
 */
export function chainSupersedesSource(params: {
  sourceDocumentType: string | null | undefined
  targetDocumentType: string | null | undefined
}): boolean {
  return (
    SUPERSEDED_BY_INVOICE_TYPES.has(String(params.sourceDocumentType || "")) &&
    SUPERSEDING_TYPES.has(String(params.targetDocumentType || ""))
  )
}

/**
 * Link for a chained document that REPLACES its source rather than paying it.
 * Direction follows the trigger: the conversion branch looks for links where the
 * source document is `source_document_id`.
 */
export function buildChainedConversionLink(params: {
  sourceDocumentId: string
  chainedDocumentId: string
  note?: string | null
}): {
  sourceDocumentId: string
  targetDocumentId: string
  linkType: "conversion"
  amount: number
  note: string | null
} {
  return {
    sourceDocumentId: params.sourceDocumentId,
    targetDocumentId: params.chainedDocumentId,
    linkType: "conversion",
    amount: 0,
    note: params.note ?? null,
  }
}
