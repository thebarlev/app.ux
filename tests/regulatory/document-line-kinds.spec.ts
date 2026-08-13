import { expect, test } from "@playwright/test";

import {
  buildLineItemRows,
  isItemDocumentType,
  isRealPayment,
  splitLineItemsByKind,
} from "@/lib/documents/line-kinds";
import { classifyLine } from "@/lib/regulatory/bkmv/map";
import type { BkmvDocument, BkmvLineItem } from "@/lib/regulatory/bkmv/types";
import type { DocumentDraftPayload, PaymentRow, TaxInvoiceItemRow } from "@/lib/documents/types";

/**
 * The write path for a חשבונית מס/קבלה that carries goods AND a payment.
 *
 * These are Node-level and touch no database: `buildLineItemRows` decides exactly which rows
 * are inserted, so measuring its output measures what would be stored.
 */

const DOC = "11111111-1111-1111-1111-111111111111";
const CO = "22222222-2222-2222-2222-222222222222";

function item(overrides: Partial<TaxInvoiceItemRow> = {}): TaxInvoiceItemRow {
  return {
    label: "ייעוץ",
    sku: "",
    description: "ייעוץ",
    quantity: 1,
    unitPrice: 500,
    currency: "ILS",
    vatMode: "before",
    lineTotal: 500,
    ...overrides,
  } as TaxInvoiceItemRow;
}

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    method: "מזומן",
    date: "2025-03-04",
    amount: 590,
    currency: "ILS",
    ...overrides,
  } as PaymentRow;
}

function payload(overrides: Partial<DocumentDraftPayload> = {}): DocumentDraftPayload {
  return {
    documentType: "invoiceReceipt",
    customerName: "לקוח",
    customerId: null,
    customerTaxId: null,
    documentDate: "2025-03-04",
    paymentDueDate: "",
    description: "",
    payments: [payment()],
    items: [item()],
    notes: "",
    currency: "ILS",
    ...overrides,
  } as DocumentDraftPayload;
}

/**
 * ⛔ The bug, stated as a test.
 *
 * `isItemDocumentType("invoiceReceipt")` is true, and the three insert sites were written as
 * `if (items) … else if (payments) …`. So the payment the form collected and the payload
 * carried was dropped for every 320 that had item lines — which is all of them.
 */
test("a 320 stores its goods lines AND its payment line", () => {
  const rows = buildLineItemRows({
    documentType: "invoiceReceipt",
    payload: payload({ items: [item(), item({ label: "פיתוח" })] }),
    documentId: DOC,
    companyId: CO,
  });

  expect(rows).toHaveLength(3);
  expect(rows.map((r: any) => r.line_number)).toEqual([1, 2, 3]);

  // Payment last, numbered after the goods, so line_number stays unique and ordered.
  const last = rows[2] as any;
  expect(last.description).toBe("מזומן");
  expect((last.payment_metadata as any).kind).toBe("payment");
});

test("the type predicate that made the else unreachable is still true", () => {
  // Kept as a test rather than a comment: if this ever becomes false the fix above is moot
  // and the reasoning behind it needs re-reading.
  expect(isItemDocumentType("invoiceReceipt")).toBe(true);
});

test("the payment line carries GROSS, matching what was received", () => {
  const rows = buildLineItemRows({
    // 500 net + 18% = 590 received.
    payload: payload({ items: [item({ unitPrice: 500, lineTotal: 500 })], payments: [payment({ amount: 590 })] }),
    documentType: "invoiceReceipt",
    documentId: DOC,
    companyId: CO,
  });

  const goods = rows[0] as any;
  const paid = rows[1] as any;
  expect(goods.line_total).toBe(500);
  expect(paid.line_total).toBe(590);
  expect(paid.unit_price).toBe(590);
  expect(paid.quantity).toBe(1);
});

/**
 * ⛔ 1265 net, enforced where it is written rather than where it is typed.
 *
 * The form clients convert (getLineUnitNet) and always did after 6640ec4. A caller that
 * builds its own payload did not — measured on the demo batch, which stored quantity 1,
 * unit_price 1180.00 and line_total 1000.00 on a real issued document.
 */
test("unit_price is derived from the net line total, whatever the caller sent", () => {
  const rows = buildLineItemRows({
    documentType: "invoiceReceipt",
    payload: payload({
      // Gross unit price with a net line total: exactly what the harness sent.
      items: [item({ quantity: 1, unitPrice: 1180, lineTotal: 1000, vatMode: "included" })],
      payments: [payment({ amount: 1180 })],
    }),
    documentId: DOC,
    companyId: CO,
  })

  const goods = rows[0] as any
  expect(goods.unit_price).toBe(1000)
  expect(goods.line_total).toBe(1000)
  // 1267 = 1264 x 1265, by construction.
  expect(goods.quantity * goods.unit_price).toBeCloseTo(goods.line_total, 2)
})

test("a multi-unit line divides, so the identity still holds", () => {
  const rows = buildLineItemRows({
    documentType: "tax_invoice",
    payload: payload({
      documentType: "tax_invoice",
      items: [item({ quantity: 4, unitPrice: 295, lineTotal: 1000 })],
    } as any),
    documentId: DOC,
    companyId: CO,
  })

  const goods = rows[0] as any
  expect(goods.unit_price).toBe(250)
  expect(goods.quantity * goods.unit_price).toBeCloseTo(goods.line_total, 2)
})

test("the already-correct form payload is unchanged, so the fix is idempotent", () => {
  const rows = buildLineItemRows({
    documentType: "tax_invoice",
    // What a fixed form client sends: net in both fields.
    payload: payload({ documentType: "tax_invoice", items: [item({ quantity: 2, unitPrice: 500, lineTotal: 1000 })] } as any),
    documentId: DOC,
    companyId: CO,
  })

  expect((rows[0] as any).unit_price).toBe(500)
})

test("a zero-quantity line keeps what it was given rather than dividing by zero", () => {
  const rows = buildLineItemRows({
    documentType: "tax_invoice",
    payload: payload({ documentType: "tax_invoice", items: [item({ quantity: 0, unitPrice: 42, lineTotal: 0 })] } as any),
    documentId: DOC,
    companyId: CO,
  })

  expect((rows[0] as any).unit_price).toBe(42)
})

test("a tax invoice gets no payment line even if the payload carries one", () => {
  const rows = buildLineItemRows({
    documentType: "tax_invoice",
    payload: payload({ documentType: "tax_invoice" } as any),
    documentId: DOC,
    companyId: CO,
  });

  expect(rows).toHaveLength(1);
  expect((rows[0] as any).description).toBe("ייעוץ");
});

test("a receipt is unchanged: payments only, numbered from 1", () => {
  const rows = buildLineItemRows({
    documentType: "receipt",
    payload: payload({ documentType: "receipt", items: [], payments: [payment(), payment({ method: "צ׳ק" })] } as any),
    documentId: DOC,
    companyId: CO,
  });

  expect(rows).toHaveLength(2);
  expect(rows.map((r: any) => r.line_number)).toEqual([1, 2]);
  expect(rows.map((r: any) => r.description)).toEqual(["מזומן", "צ׳ק"]);
});

/**
 * The forms open with one blank payment row. Storing it would produce a D120 with no payment
 * means, and `bkmvPaymentMeansCode` stops the entire export on an unmapped label — one blank
 * row would take the file down rather than be ignored.
 */
test("a blank payment row is not stored on a 320", () => {
  const rows = buildLineItemRows({
    documentType: "invoiceReceipt",
    payload: payload({ payments: [{ method: "", date: "2025-03-04", amount: 0, currency: "ILS" } as PaymentRow] }),
    documentId: DOC,
    companyId: CO,
  });

  expect(rows).toHaveLength(1);
  expect((rows[0] as any).description).toBe("ייעוץ");
});

test("isRealPayment wants both a means and an amount", () => {
  expect(isRealPayment(payment())).toBe(true);
  expect(isRealPayment(payment({ method: "" }))).toBe(false);
  expect(isRealPayment(payment({ method: "   " }))).toBe(false);
  expect(isRealPayment(payment({ amount: 0 }))).toBe(false);
  // A cancellation receipt's negative amount is a real payment.
  expect(isRealPayment(payment({ amount: -590 }))).toBe(true);
});

/**
 * ⛔ The reason the label had to be written at all.
 *
 * `classifyLine` reads `payment_metadata.kind` and falls back on the document's type. For a
 * receipt the fallback says payment; for anything else it says goods. So an unlabelled payment
 * line on a 320 would have been written into D110 — a payment recorded as merchandise.
 */
test("the stored payment line classifies as a payment, not as goods", () => {
  const rows = buildLineItemRows({
    documentType: "invoiceReceipt",
    payload: payload(),
    documentId: DOC,
    companyId: CO,
  });

  const doc = { documentType: "invoice_receipt" } as BkmvDocument;
  const asBkmv = (r: any): BkmvLineItem =>
    ({ paymentMetadata: r.payment_metadata, lineNumber: r.line_number }) as BkmvLineItem;

  expect(classifyLine(asBkmv(rows[0]), doc)).toBe("goods");
  expect(classifyLine(asBkmv(rows[1]), doc)).toBe("payment");

  // And without the label it would have been goods — the failure this prevents.
  expect(classifyLine({ paymentMetadata: null } as BkmvLineItem, doc)).toBe("goods");
});

/** ── Reading a document back ─────────────────────────────────────────────── */

test("a labelled document splits into its two halves", () => {
  const { itemLines, paymentLines } = splitLineItemsByKind([
    { payment_metadata: { vatMode: "before" } },
    { payment_metadata: { vatMode: "before" } },
    { payment_metadata: { kind: "payment" } },
  ]);

  expect(itemLines).toHaveLength(2);
  expect(paymentLines).toHaveLength(1);
});

/**
 * Documents issued before `kind` existed are tax records and must keep loading exactly as
 * they did. With no label anywhere, both lists get every line — which is what the two loaders
 * did unconditionally, and why an old receipt still opens.
 */
test("an unlabelled legacy document keeps the old behaviour", () => {
  const rows = [{ payment_metadata: null }, { payment_metadata: { cardType: "ויזה" } }];
  const { itemLines, paymentLines } = splitLineItemsByKind(rows);

  expect(itemLines).toHaveLength(2);
  expect(paymentLines).toHaveLength(2);
});

test("one labelled line is enough to switch a document to the labelled rule", () => {
  const { itemLines, paymentLines } = splitLineItemsByKind([
    { payment_metadata: null },
    { payment_metadata: { kind: "payment" } },
  ]);

  expect(itemLines).toHaveLength(1);
  expect(paymentLines).toHaveLength(1);
});
