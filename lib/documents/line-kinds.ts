import type {
  DocumentDraftPayload,
  DocumentIssueType,
  PaymentRow,
  TaxInvoiceItemRow,
} from "@/lib/documents/types"
import { paymentRowToLineItem as convertPayment } from "@/lib/types/receipt"

/**
 * Splitting a document's line items into its goods lines and its payment lines.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Until now every document had exactly one kind of line: a tax invoice had goods, a receipt
 * had payments, and so anything that needed to tell them apart could look at the document's
 * type instead of the line. Two loaders did something even simpler — they mapped every line
 * into an items array AND into a payments array, and relied on the caller only reading the
 * one that made sense for that document.
 *
 * A חשבונית מס/קבלה carries both. The moment it does, "map everything into both" turns a
 * payment into a product row and a product into a payment row, and reopening a draft shows
 * both mistakes at once.
 *
 * ── THE RULE, AND WHY LEGACY DATA KEEPS ITS OLD BEHAVIOUR ───────────────────
 *
 * A line is a payment when `payment_metadata.kind === "payment"`, and goods otherwise.
 *
 * But documents issued before `kind` was written carry no discriminator at all, and reading
 * them under that rule would classify every line of an existing receipt as goods — breaking
 * the display of documents that are already issued and are tax records. So the split first
 * asks whether ANY line in the document carries a kind:
 *
 *   - none does  → legacy document, both lists get every line, exactly as before
 *   - one does   → the document is labelled, and the labels decide
 *
 * ⚠️ `lib/pdf-service.ts` has the same rule inline, written before this file and unchanged.
 * It is a second implementation of one decision and is recorded in FOLLOWUPS; it is not
 * touched here because the renderer is not something to refactor days before an export is
 * produced from it.
 */


/*
 * ── ⛔ WHY THESE LIVE HERE AND NOT IN actions.ts ────────────────────────────
 *
 * They were in `lib/documents/actions.ts`, which carries "use server". Every export of such
 * a module becomes a server action and must be async, so a pure function inside it can only
 * be private — and a private function cannot be tested.
 *
 * The bug below (an `else if` that dropped every payment line on a חשבונית מס/קבלה) sat in
 * three copies in that file for as long as it did partly because none of them was reachable
 * from a test. They are pure, they decide what gets written to the database, and they are now
 * exported and pinned.
 */

export type LineKindRow = {
  payment_metadata?: unknown;
}

function kindOf(row: LineKindRow): string {
  const meta = row?.payment_metadata as { kind?: unknown } | null | undefined
  const k = meta?.kind
  return typeof k === "string" ? k.trim() : ""
}

/** True when at least one line in the document says what it is. */
export function hasLineKindDiscriminator(rows: readonly LineKindRow[]): boolean {
  return (rows || []).some((r) => kindOf(r).length > 0)
}

/**
 * The document's lines, split.
 *
 * Returns the same array twice for a legacy document with no labels, which is precisely the
 * behaviour the callers had before and the reason an unlabelled receipt still loads.
 */
export function splitLineItemsByKind<T extends LineKindRow>(
  rows: readonly T[]
): { itemLines: T[]; paymentLines: T[] } {
  const all = [...(rows || [])]
  if (!hasLineKindDiscriminator(all)) {
    return { itemLines: all, paymentLines: all }
  }
  return {
    itemLines: all.filter((r) => kindOf(r) !== "payment"),
    paymentLines: all.filter((r) => kindOf(r) === "payment"),
  }
}

export function isItemDocumentType(documentType: DocumentIssueType) {
  return (
    documentType === "tax_invoice" ||
    documentType === "invoiceReceipt" ||
    documentType === "creditNote" ||
    documentType === "quote" ||
    documentType === "proforma" ||
    documentType === "workOrder" ||
    documentType === "deliveryNote" ||
    documentType === "returnNote" ||
    documentType === "purchaseOrder" ||
    documentType === "selfInvoice" ||
    documentType === "selfCreditNote"
  );
}

export function itemRowToLineItem(
  item: TaxInvoiceItemRow,
  documentId: string,
  companyId: string,
  lineNumber: number,
  issueDate: string
) {
  const metadata = {
    sku: item.sku || null,
    label: item.label || null,
    details: item.description || null,
    vatMode: item.vatMode || "before",
  };
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const rawUnitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  const lineTotal = Number.isFinite(item.lineTotal) ? item.lineTotal : quantity * rawUnitPrice;

  /*
   * ⛔ unit_price is DERIVED from the line total, not taken as given.
   *
   * Field 1265 is "מחיר ליחידה ללא מע\"מ" and 1267 is "הכמות בשורה * מחיר ליח' ללא מע\"מ
   * בניכוי הנחת השורה" (spec 1.31, page 13). So the file requires 1267 = 1264 x 1265, and
   * both net. Deriving 1265 from the net line total makes that identity hold by
   * construction instead of by agreement between callers.
   *
   * ── WHY IT MOVED HERE ─────────────────────────────────────────────────────
   *
   * The conversion used to live in the form clients (`getLineUnitNet`), which fixed the
   * screens and left the write path unprotected. Measured on the demo batch: a caller that
   * builds its own payload — the batch harness, and any future API — stored
   * quantity 1, unit_price 1180.00, line_total 1000.00. A row whose own multiplication does
   * not hold, and a 1265 carrying the VAT its own definition excludes. Document 2 of the
   * demo company is that row.
   *
   * Idempotent for the form path: those clients already send net for both, and dividing a
   * net line total by the quantity returns the same net unit price. Nothing about them
   * changes.
   *
   * ⚠️ Write side only. The renderer and the uniform-file mapper still read what is stored,
   * so every document already issued re-renders exactly as it was delivered.
   */
  const unitPrice = quantity > 0 ? Number((lineTotal / quantity).toFixed(2)) : rawUnitPrice;

  return {
    document_id: documentId,
    company_id: companyId,
    line_number: lineNumber,
    description: item.label || item.description || "פריט",
    item_date: issueDate,
    unit_price: unitPrice,
    quantity: quantity,
    line_total: lineTotal,
    currency: item.currency,
    bank_name: null,
    branch: null,
    account_number: null,
    item_sku: item.sku || null, // ✅ שמירה ישירה של המק"ט
    payment_metadata: metadata,
  };
}

/**
 * Document types that carry goods lines AND payment lines on the same document.
 *
 * ⛔ חשבונית מס/קבלה, and only it. A tax invoice records a debt and a receipt records money
 * received; a 320 does both, which is the whole point of the type and the reason appendix 1
 * calls it "חשבונית מס / קבלה" with nothing qualifying it.
 *
 * Deliberately not `isPaymentBearingDocumentType` from chaining.ts: that set speaks the
 * database's vocabulary ("invoice_receipt") while this file speaks DocumentIssueType's
 * ("invoiceReceipt"), and a silent miss between the two spellings is exactly how a payment
 * line disappears.
 */
export function carriesPaymentAndItemLines(documentType: DocumentIssueType) {
  return documentType === "invoiceReceipt";
}

/**
 * A payment row worth storing: a means of payment and an amount.
 *
 * The forms open with one blank payment row, so an issued document whose payments section was
 * never filled arrives here as `[{ method: "", amount: 0 }]`. Writing that produces a D120
 * whose payment means is empty, and the uniform-file mapper stops the whole export on an
 * unmapped payment label — a blank row would take the file down rather than be ignored.
 *
 * ⚠️ Applied ONLY to documents that carry both kinds. On a receipt the payments are the
 * document, the form already refuses to issue without a means, and the insert stays exactly
 * as it was.
 */
export function isRealPayment(p: PaymentRow): boolean {
  const method = String(p?.method || "").trim();
  const amount = Number(p?.amount);
  return method.length > 0 && Number.isFinite(amount) && amount !== 0;
}

/**
 * Every line a document should store, in one place.
 *
 * ── ⛔ THE BUG THIS REPLACES ────────────────────────────────────────────────
 *
 * Three separate copies of this decision existed — in `replaceDocumentLineItems`,
 * `saveDocumentDraftAction` and `issueDocumentAction` — and all three were written as:
 *
 *     if (isItemDocumentType(documentType) && payload.items?.length) { insert items }
 *     else if (payload.payments?.length)                            { insert payments }
 *
 * `isItemDocumentType("invoiceReceipt")` is true. So for every חשבונית מס/קבלה with item
 * lines — which is all of them — the first branch ran and the `else` never did. The form
 * collected the payment, the payload carried it (`payments: payments`), the action received
 * it, and it was dropped without a log line while the document came out looking complete.
 *
 * Payment lines are numbered after the goods lines so line_number stays unique and ordered.
 */
export function buildLineItemRows(args: {
  documentType: DocumentIssueType;
  payload: DocumentDraftPayload;
  documentId: string;
  companyId: string;
}) {
  const { documentType, payload, documentId, companyId } = args;
  const rows: ReturnType<typeof convertPayment>[] = [];

  const wantsItems = isItemDocumentType(documentType);
  if (wantsItems && payload.items && payload.items.length > 0) {
    rows.push(
      ...(payload.items.map((item, idx) =>
        itemRowToLineItem(item, documentId, companyId, idx + 1, payload.documentDate)
      ) as ReturnType<typeof convertPayment>[])
    );
  }

  // Payments belong on a payment-only document, and on a 320 alongside its goods.
  const wantsPayments = !wantsItems || carriesPaymentAndItemLines(documentType);
  if (wantsPayments && payload.payments && payload.payments.length > 0) {
    const source = wantsItems ? payload.payments.filter(isRealPayment) : payload.payments;
    const offset = rows.length;
    rows.push(
      ...source.map((payment, idx) => convertPayment(payment, documentId, companyId, offset + idx + 1))
    );
  }

  return rows;
}

