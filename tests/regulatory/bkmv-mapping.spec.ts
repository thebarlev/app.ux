import { expect, test } from "@playwright/test";

import { BKMV_TRANSLITERATIONS } from "@/lib/regulatory/bkmv/text";
import {
  BKMV_EXPORTABLE_DOCUMENT_TYPES,
  BKMV_UNMAPPED_LOCKED_SEQUENCES,
  BKMV_PAYMENT_MEANS_NEEDS_ACCOUNTANT,
  bkmvIsExportableDocumentType,
  bkmvNormaliseCurrency,
  bkmvClearingHouseCode,
  bkmvCreditDealCode,
  bkmvDocumentTypeCode,
  bkmvPaymentMeansCode,
} from "@/lib/regulatory/bkmv/codes";
import { formatAmount, formatDateYYYYMMDD, formatTimeHHMM } from "@/lib/regulatory/bkmv/format";
import { encodeIso88598i } from "@/lib/regulatory/bkmv/encoding";
import { BKMV_AMOUNT_SIGN, BKMV_DECLARED_VALUES, BKMV_RECORDS } from "@/lib/regulatory/bkmv/spec";
import { buildBkmvTxt } from "@/lib/regulatory/bkmv/build";
import { classifyLine } from "@/lib/regulatory/bkmv/map";
import type { BkmvAmountField } from "@/lib/regulatory/bkmv/types";
import type { BkmvContext, BkmvDocument, BkmvLineItem } from "@/lib/regulatory/bkmv/types";

/** Picks a field out of the imported tables so the test cannot invent a width. */
function field(recordKey: "C100" | "D110" | "D120", no: number) {
  const f = BKMV_RECORDS[recordKey]!.fields.find((x) => x.no === no);
  if (!f) throw new Error(`field ${no} not found in ${recordKey}`);
  return f;
}

/**
 * The half-open [start, end) offsets of a field inside its record, summed from the
 * widths in the imported tables. Hardcoding an offset here would be inventing the
 * very thing under test — and an earlier version of this file got two of them wrong.
 */
function columns(recordKey: "A100" | "C100" | "D110" | "D120" | "Z900", no: number): [number, number] {
  let start = 0;
  for (const f of BKMV_RECORDS[recordKey]!.fields) {
    if (f.no === no) return [start, start + f.width];
    start += f.width;
  }
  throw new Error(`field ${no} not found in ${recordKey}`);
}

function at(line: string, recordKey: "A100" | "C100" | "D110" | "D120" | "Z900", no: number): string {
  const [a, b] = columns(recordKey, no);
  return line.slice(a, b);
}

const CTX: BkmvContext = {
  companyId: "c0",
  companyTaxId: "515960508",
  companyName: 'אוקסלנט בע"מ',
  from: "2026-01-01",
  to: "2026-12-31",
  generatedAtIso: "2026-08-09T13:42:00.000Z",
};

function doc(over: Partial<BkmvDocument> = {}): BkmvDocument {
  return {
    id: "d1",
    documentType: "invoice_receipt",
    documentNumber: "1156",
    issueDate: "2026-03-04",
    finalizedAt: "2026-03-04T09:07:00.000Z",
    createdAt: "2026-03-04T09:00:00.000Z",
    documentStatus: "final",
    currency: "ILS",
    totalAmount: 1170,
    subtotal: 1000,
    vatAmount: 170,
    vatRate: 17,
    customerName: "לקוח בדיקה",
    customerTaxId: "123456782",
    customerAddress: "הרצל 12",
    customerPhone: "03-1234567",
    customerCity: "תל אביב",
    customerPostalCode: "6120101",
    customerCountry: "IL",
    customerNumber: "C-7",
    baseDocumentType: null,
    baseDocumentNumber: null,
    ...over,
  };
}

function line(over: Partial<BkmvLineItem> = {}): BkmvLineItem {
  return {
    documentId: "d1",
    lineNumber: 1,
    description: "ייעוץ",
    quantity: 1,
    unitPrice: 1000,
    discountAmount: 0,
    lineTotal: 1000,
    currency: "ILS",
    itemDate: null,
    itemCode: null,
    bankName: null,
    branch: null,
    accountNumber: null,
    paymentMetadata: null,
    ...over,
  };
}

// ---------------------------------------------------------------- dates

test("a date is eight digits as YYYYMMDD, not DDMMYYYY", () => {
  expect(formatDateYYYYMMDD("2026-03-04")).toBe("20260304");
  expect(formatDateYYYYMMDD("2026-12-31")).toBe("20261231");
  expect(() => formatDateYYYYMMDD("04/03/2026")).toThrow(/expected YYYY-MM-DD/);
});

test("a time is four digits as hhmm", () => {
  expect(formatTimeHHMM(new Date(2026, 7, 9, 16, 42))).toBe("1642");
  expect(formatTimeHHMM(new Date(2026, 7, 9, 6, 5))).toBe("0605");
});

// ---------------------------------------------------------------- amounts

test("a positive amount carries a literal + and a negative carries -", () => {
  expect(BKMV_AMOUNT_SIGN.positive).toBe("+");
  expect(BKMV_AMOUNT_SIGN.negative).toBe("-");
});

test("the worked examples from section 2.3 come out exactly as printed", () => {
  // x9(5)v99: one sign column, five integer digits, two decimals — eight columns.
  const f: BkmvAmountField = {
    no: 9999,
    desc: "test",
    tech: "X9(5)v99",
    width: 8,
    from: 1,
    to: 8,
    requirement: "mandatory",
    kind: "amount",
    signed: true,
    intDigits: 5,
    decDigits: 2,
  };

  expect(formatAmount(-12345.65, f)).toBe("-1234565");
  expect(formatAmount(1245.65, f)).toBe("+0124565");
  expect(formatAmount(1245, f)).toBe("+0124500");
  expect(formatAmount(-12345.65, f)).toHaveLength(8);
});

test("a real amount field from the tables gets its full width and no separator", () => {
  const f = field("C100", 1223) as BkmvAmountField; // X9(12)v99
  const out = formatAmount(1170, f);

  expect(out).toHaveLength(15);
  expect(out).toBe("+" + "117000".padStart(14, "0"));
  expect(out).not.toContain(".");
});

test("an unsigned amount field has no sign column at all", () => {
  const f = field("D110", 1268) as BkmvAmountField; // 9(2)v99, the VAT rate
  expect(f.signed).toBe(false);
  expect(formatAmount(17, f)).toBe("1700");
  expect(formatAmount(17, f)).toHaveLength(4);
  expect(() => formatAmount(-1, f)).toThrow(/cannot carry a negative/);
});

// ---------------------------------------------------------------- code tables

test("every mapped document type resolves to its appendix-1 code", () => {
  expect(bkmvDocumentTypeCode("tax_invoice")).toBe("305");
  expect(bkmvDocumentTypeCode("invoice_receipt")).toBe("320");
  expect(bkmvDocumentTypeCode("receipt")).toBe("400");
  // work_order joined on measurement (two locked sequences, one at 1003).
  expect(bkmvDocumentTypeCode("work_order")).toBe("100");
});

test("an unmapped document type throws instead of guessing a code", () => {
  expect(() => bkmvDocumentTypeCode("credit_note")).toThrow(/No BKMV document type code/);
  expect(() => bkmvDocumentTypeCode("quote")).toThrow(/closed table/);
});

test("the 21 payment labels map onto the nine codes as decided", () => {
  const expected: Record<string, string> = {
    "מזומן": "1",
    "צ׳ק": "2",
    "V-CHECK": "2",
    "כרטיס אשראי": "3",
    "Google Pay": "3",
    "Apple Pay": "3",
    "העברה בנקאית": "4",
    Bit: "4",
    PayBox: "4",
    Pay: "4",
    Colu: "4",
    "שובר BuyME": "5",
    "שובר מתנה": "5",
    PayPal: "9",
    Payoneer: "9",
    "ביטקוין": "9",
    "אתריום": "9",
    "שווה כסף": "9",
    "ניכוי במקור": "9",
    "ניכוי חלק עובד טל״א": "9",
    "ניכוי אחר": "9",
  };

  for (const [label, code] of Object.entries(expected)) {
    expect(bkmvPaymentMeansCode(label), label).toBe(code);
  }
  expect(Object.keys(expected)).toHaveLength(21);
});

test("codes 6, 7 and 8 are unreachable, because nothing in this system records them", () => {
  const produced = new Set(
    ["מזומן", "צ׳ק", "כרטיס אשראי", "העברה בנקאית", "שובר מתנה", "PayPal", "תשלום"].map(
      bkmvPaymentMeansCode
    )
  );
  expect(produced.has("6")).toBe(false);
  expect(produced.has("7")).toBe(false);
  expect(produced.has("8")).toBe(false);
});

test("an unknown payment label throws and names itself, rather than falling to 9", () => {
  expect(() => bkmvPaymentMeansCode("Revolut")).toThrow(/"Revolut"/);
  expect(() => bkmvPaymentMeansCode("Revolut")).toThrow(/not a fallback to 9/);
  expect(() => bkmvPaymentMeansCode("")).toThrow(/Field 1306 is mandatory/);
});

test("the three withholding labels are flagged as needing an accountant", () => {
  expect([...BKMV_PAYMENT_MEANS_NEEDS_ACCOUNTANT]).toEqual([
    "ניכוי במקור",
    "ניכוי חלק עובד טל״א",
    "ניכוי אחר",
  ]);
  // They are mapped, so a file can still be produced — but the mapping is a
  // placeholder and the list is what makes that visible.
  for (const label of BKMV_PAYMENT_MEANS_NEEDS_ACCOUNTANT) {
    expect(bkmvPaymentMeansCode(label)).toBe("9");
  }
});

test("clearing house and credit deal codes translate, and the spec's missing 5 is respected", () => {
  expect(bkmvClearingHouseCode("isracard")).toBe("1");
  expect(bkmvClearingHouseCode("diners")).toBe("3");
  expect(bkmvClearingHouseCode("2")).toBe("2");
  // The table has no 5, so a bare "5" is not accepted as a code.
  expect(bkmvClearingHouseCode("5")).toBeUndefined();
  expect(bkmvClearingHouseCode("visa")).toBeUndefined();
  expect(bkmvClearingHouseCode(undefined)).toBeUndefined();

  expect(bkmvCreditDealCode("regular")).toBe("1");
  expect(bkmvCreditDealCode("payments")).toBe("2");
  expect(bkmvCreditDealCode("deferred")).toBe("4");
  expect(bkmvCreditDealCode("nonsense")).toBeUndefined();
});

// ---------------------------------------------------------------- line roles

test("a line's role comes from payment_metadata.kind when it is there", () => {
  const d = doc();
  expect(classifyLine(line({ paymentMetadata: { kind: "payment" } }), d)).toBe("payment");
  expect(classifyLine(line({ paymentMetadata: { kind: "item" } }), d)).toBe("goods");
});

test("without kind, a receipt's lines are payments and an invoice's are goods", () => {
  expect(classifyLine(line(), doc({ documentType: "receipt" }))).toBe("payment");
  expect(classifyLine(line(), doc({ documentType: "tax_invoice" }))).toBe("goods");
  expect(classifyLine(line(), doc({ documentType: "invoice_receipt" }))).toBe("goods");
});

// ---------------------------------------------------------------- the built file

const IDENT = "123456789012345";

test("a 320 with a payment line produces C100, D110 and D120", () => {
  const d = doc();
  const { recordCounts, recordCount, stats } = buildBkmvTxt({
    ctx: CTX,
    documents: [d],
    lineItems: [
      line({ lineNumber: 1, paymentMetadata: { kind: "item" } }),
      line({
        lineNumber: 2,
        description: "כרטיס אשראי",
        lineTotal: 1170,
        itemDate: "2026-03-04",
        paymentMetadata: { kind: "payment", cardType: "isracard", cardLastDigits: "1234", cardDealType: "payments" },
      }),
    ],
    primaryIdentifier: IDENT,
  });

  expect(recordCounts).toEqual({ A100: 1, C100: 1, D110: 1, D120: 1, Z900: 1 });
  expect(recordCount).toBe(5);
  expect(stats.docsWithoutPaymentLines).toBe(0);
});

test("D120 is produced for a 320, not only for a 400", () => {
  const payment = line({
    description: "כרטיס אשראי",
    paymentMetadata: { kind: "payment" },
  });

  const asInvoiceReceipt = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ documentType: "invoice_receipt" })],
    lineItems: [payment],
    primaryIdentifier: IDENT,
  });
  expect(asInvoiceReceipt.recordCounts.D120).toBe(1);

  const asReceipt = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ documentType: "receipt" })],
    lineItems: [line({ description: "מזומן" })],
    primaryIdentifier: IDENT,
  });
  expect(asReceipt.recordCounts.D120).toBe(1);
});

test("a document with no payment line gets no D120, and is counted", () => {
  const { recordCounts, stats } = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  expect(recordCounts.D120).toBeUndefined();
  expect(stats.docsWithoutPaymentLines).toBe(1);
});

test("every record is its published length, and the record number runs 1..n", () => {
  const lines = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [
      line({ lineNumber: 1, paymentMetadata: { kind: "item" } }),
      line({ lineNumber: 2, description: "מזומן", paymentMetadata: { kind: "payment" } }),
    ],
    primaryIdentifier: IDENT,
  })
    .txtBuffer.toString("latin1")
    .split("\r\n")
    .filter(Boolean);

  const lengths: Record<string, number> = { A100: 95, C100: 444, D110: 339, D120: 222, Z900: 110 };
  expect(lines).toHaveLength(5);

  lines.forEach((l, i) => {
    const code = l.slice(0, 4);
    expect(l, `${code} length`).toHaveLength(lengths[code]);
    // Section 2.4.י: the second field is the running record number.
    const recordNoField = { A100: 1101, C100: 1201, D110: 1251, D120: 1301, Z900: 1151 }[code]!;
    expect(Number(at(l, code as "A100", recordNoField)), `${code} record number`).toBe(i + 1);
  });

  // Z900's total (1155) equals the record count, and it counts itself.
  expect(Number(at(lines[lines.length - 1], "Z900", 1155))).toBe(5);
});

test("the primary identifier is the same in A100 1103 and Z900 1153", () => {
  const lines = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  })
    .txtBuffer.toString("latin1")
    .split("\r\n")
    .filter(Boolean);

  expect(at(lines[0], "A100", 1103)).toBe(IDENT);
  expect(at(lines[lines.length - 1], "Z900", 1153)).toBe(IDENT);
  expect(at(lines[0], "A100", 1104)).toBe(BKMV_DECLARED_VALUES.systemConstant);
});

test("C100 carries the mapped values on the columns the spec gives them", () => {
  const c100 = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  })
    .txtBuffer.toString("latin1")
    .split("\r\n")[1];

  expect(at(c100, "C100", 1200)).toBe("C100");
  expect(at(c100, "C100", 1202)).toBe("515960508");
  expect(at(c100, "C100", 1203)).toBe("320");
  expect(at(c100, "C100", 1204)).toBe("1156".padEnd(20, " "));
  expect(at(c100, "C100", 1205)).toBe("20260304");
  // hhmm of finalized_at in local time, so the expectation is computed the same way
  // rather than pinned to one timezone.
  expect(at(c100, "C100", 1206)).toBe(formatTimeHHMM(new Date("2026-03-04T09:07:00.000Z")));
  expect(at(c100, "C100", 1218)).toBe("ILS");
  expect(at(c100, "C100", 1223)).toBe("+" + "117000".padStart(14, "0"));
  expect(at(c100, "C100", 1230)).toBe("20260304");
});

test("a line discount is written negative, per section yod-bet", () => {
  const d110 = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ discountAmount: 50, paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  })
    .txtBuffer.toString("latin1")
    .split("\r\n")[2];

  expect(at(d110, "D110", 1250)).toBe("D110");
  // 1266 הנחת שורה — X9(12)v99, negative because it reduces the line total.
  expect(at(d110, "D110", 1266)).toBe("-" + "5000".padStart(14, "0"));
  // and the line total beside it stays positive
  expect(at(d110, "D110", 1267)).toBe("+" + "100000".padStart(14, "0"));
});

test("an unmapped payment label stops the whole export rather than mislabelling one line", () => {
  expect(() =>
    buildBkmvTxt({
      ctx: CTX,
      documents: [doc({ documentType: "receipt" })],
      lineItems: [line({ description: "Revolut" })],
      primaryIdentifier: IDENT,
    })
  ).toThrow(/"Revolut"/);
});

// ------------------------------------------------- 1256/1257, the base document

/**
 * ⛔ These two were recorded as having NO SOURCE. They do have one.
 *
 * The record said no `base_document_id` column exists — true, and the wrong thing to look for.
 * `document_links` carries the relation, is written by createDocumentLinkAction, and already
 * runs in the direction "this document refers to that one" (its one production row is
 * receipt 4000 -> tax_invoice 1000). A credit note is the case that makes the pair matter.
 */
test("a document based on another writes its base type and number into D110", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [
      doc({
        documentNumber: "4000",
        documentType: "receipt",
        baseDocumentType: "tax_invoice",
        baseDocumentNumber: "1000",
      }),
    ],
    lineItems: [line({ description: "מזומן", paymentMetadata: { kind: "payment" } })],
    primaryIdentifier: IDENT,
  });
  // A receipt's line is a payment, so force a goods line to inspect D110.
  const withGoods = buildBkmvTxt({
    ctx: CTX,
    documents: [
      doc({
        documentNumber: "330001",
        documentType: "tax_invoice",
        baseDocumentType: "tax_invoice",
        baseDocumentNumber: "1000",
      }),
    ],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const d110 = withGoods.txtBuffer.toString("latin1").split("\r\n").find((l) => l.startsWith("D110")) as string;
  expect(at(d110, "D110", 1256)).toBe("305");
  expect(at(d110, "D110", 1257)).toBe("1000".padEnd(20, " "));
  expect(built.notes.unmappedBaseDocuments).toEqual([]);
});

test("no base document leaves both fields empty, per their own widths", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ baseDocumentType: null, baseDocumentNumber: null })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const d110 = built.txtBuffer.toString("latin1").split("\r\n").find((l) => l.startsWith("D110")) as string;
  // 1256 is numeric so it renders as zeros; 1257 is alphanumeric so it renders as spaces.
  expect(at(d110, "D110", 1256)).toBe("000");
  expect(at(d110, "D110", 1257)).toBe(" ".repeat(20));
});

/**
 * ⛔ All-or-nothing, and counted.
 *
 * 1256 takes an appendix-1 code and appendix 1 is a closed table, so a base document of an
 * unmapped type has nothing legal to put there. Throwing would let one optional link take down
 * a whole export; writing 1257 alone would name a document while declaring it of no known type.
 */
test("a base document of an unmapped type empties both fields and is reported", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [
      doc({ documentNumber: "77", baseDocumentType: "quote", baseDocumentNumber: "Q-5" }),
    ],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const d110 = built.txtBuffer.toString("latin1").split("\r\n").find((l) => l.startsWith("D110")) as string;
  expect(at(d110, "D110", 1256)).toBe("000");
  expect(at(d110, "D110", 1257)).toBe(" ".repeat(20));

  expect(built.notes.unmappedBaseDocuments).toEqual([
    { documentNumber: "77", baseDocumentType: "quote", baseDocumentNumber: "Q-5" },
  ]);
});

// ------------------------------------------------- whitelist and truncation

test("only document types with an appendix-1 code are exportable, and the lookup stays closed", () => {
  expect([...BKMV_EXPORTABLE_DOCUMENT_TYPES].sort()).toEqual([
    "delivery_note",
    "invoice_receipt",
    "receipt",
    "tax_invoice",
    "work_order",
  ]);

  expect(bkmvIsExportableDocumentType("tax_invoice")).toBe(true);
  /*
   * work_order is exportable now. It was not, and the reason it changed is measured
   * rather than preferred: document_sequences holds two LOCKED work_order sequences in
   * production, one already advanced to 1003. A regulatory number that was allocated and
   * appears in no file is a gap in a sequence, which is what the registrar looks for.
   */
  expect(bkmvIsExportableDocumentType("work_order")).toBe(true);
  expect(bkmvDocumentTypeCode("work_order")).toBe("100");

  /*
   * ⛔ delivery_note is IN now, at 200, and the reversal is deliberate.
   *
   * It passed the locked-sequence test on the same day work_order did, and was left out
   * because mapping changes what enters the submitted file. What settled it was discovering
   * that the exclusion rested on a wrong measurement of mine: I had recorded "zero form
   * pages, zero form clients", having searched for a per-type directory. The generic route
   * /business/documents/new/deliveryNote renders TaxInvoiceFormClient and the new-document
   * menu links to it unguarded. The path is one click from any user, so the locked sequence
   * is not a theoretical hole — and the file now carries the type rather than the sequence
   * pointing at nothing.
   */
  expect(bkmvIsExportableDocumentType("delivery_note")).toBe(true);
  expect(bkmvDocumentTypeCode("delivery_note")).toBe("200");

  // The list is now empty, and that IS the assertion: no locked sequence feeds a type the
  // file cannot carry.
  expect([...BKMV_UNMAPPED_LOCKED_SEQUENCES]).toEqual([]);

  // Excluding a type from selection must not weaken the lookup: anything that
  // reaches it without a code still throws.
  expect(() => bkmvDocumentTypeCode("quote")).toThrow(/closed table/);
  /*
   * proforma is out too, and for the same reason delivery_note is: measured 2026-08-13 it
   * had zero form pages, zero form clients and zero documents ever created. It had been
   * mapped to 300 before this work — a declaration about something the software cannot do.
   */
  expect(bkmvIsExportableDocumentType("proforma")).toBe(false);
  expect(() => bkmvDocumentTypeCode("proforma")).toThrow(/closed table/);
});

test("one character is one byte in this encoding, so a 30-character cut is 30 columns", () => {
  // The property truncation relies on. Asserted rather than assumed.
  for (const s of ["שירותי חשבונית ירוקה מאובטחת", "Basic plan", 'א"ב', "ABC 123 אבג"]) {
    expect(encodeIso88598i(s), s).toHaveLength(s.length);
  }
});

test("a description longer than 30 characters is cut, and the cut is reported with the original", () => {
  const long = "שירותי חשבונית ירוקה מאובטחת - Basic"; // 36 characters, from production
  expect(long).toHaveLength(36);

  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ description: long, paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  // The file is read back as bytes: Hebrew lives at 0xE0-0xFA, so a latin1 string
  // of the buffer is the byte sequence, not the Hebrew. Compare like with like.
  const d110 = built.txtBuffer.toString("latin1").split("\r\n")[2];
  const written = at(d110, "D110", 1260);
  expect(written).toHaveLength(30);
  expect(written).toBe(encodeIso88598i(long.slice(0, 30)).toString("latin1"));

  expect(built.notes.truncations).toHaveLength(1);
  expect(built.notes.truncations[0]).toMatchObject({
    field: 1260,
    documentNumber: "1156",
    lineNumber: 1,
    width: 30,
    original: long,
    written: long.slice(0, 30),
  });
});

test("a description that fits is not touched and nothing is reported", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ description: "ייעוץ", paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });
  expect(built.notes.truncations).toEqual([]);
});


// ------------------------------------------- transliteration and currency

test("the transliteration table covers exactly what was approved", () => {
  expect(BKMV_TRANSLITERATIONS).toEqual({
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u00a0": " ",
  });
});

test("an en dash is transliterated, counted, and the original is kept", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ customerName: "Auditor \u2013 \u05e0\u05d5\u05e2\u05dd" })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const c100 = built.txtBuffer.toString("latin1").split("\r\n")[1];
  expect(at(c100, "C100", 1207)).toBe(
    encodeIso88598i("Auditor - \u05e0\u05d5\u05e2\u05dd".padEnd(50, " ")).toString("latin1")
  );

  expect(built.notes.transliterations).toHaveLength(1);
  expect(built.notes.transliterations[0]).toMatchObject({
    field: 1207,
    original: "Auditor \u2013 \u05e0\u05d5\u05e2\u05dd",
    written: "Auditor - \u05e0\u05d5\u05e2\u05dd",
  });
});

test("transliteration happens before truncation, so an ellipsis cannot overflow the field", () => {
  // 29 characters, of which the last is an ellipsis that becomes three.
  const desc = "a".repeat(28) + "\u2026";
  expect(desc).toHaveLength(29);

  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc()],
    lineItems: [line({ description: desc, paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const d110 = built.txtBuffer.toString("latin1").split("\r\n")[2];
  expect(at(d110, "D110", 1260)).toHaveLength(30);
  // 28 a's + "..." is 31, so it was transliterated first and then cut to 30.
  expect(at(d110, "D110", 1260)).toBe("a".repeat(28) + "..".slice(0, 2));
  expect(built.notes.transliterations).toHaveLength(1);
  expect(built.notes.truncations).toHaveLength(1);
});

test("a character with no transliteration and no encoding still throws, naming itself", () => {
  expect(() =>
    buildBkmvTxt({
      ctx: CTX,
      documents: [doc({ customerName: "caf\u00e9" })],
      lineItems: [line({ paymentMetadata: { kind: "item" } })],
      primaryIdentifier: IDENT,
    })
  ).toThrow(/Unsupported character/);
});

test("the shekel sign is normalised to ILS, counted, and nothing defaults", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ currency: "\u20aa" })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const c100 = built.txtBuffer.toString("latin1").split("\r\n")[1];
  expect(at(c100, "C100", 1218)).toBe("ILS");
  expect(built.notes.currencyNormalisations).toEqual([
    { field: 1218, documentNumber: "1156", original: "\u20aa", written: "ILS" },
  ]);

  expect(bkmvNormaliseCurrency("USD", { field: 1218, documentNumber: null })).toBe("USD");
  expect(bkmvNormaliseCurrency(null, { field: 1218, documentNumber: null })).toBeUndefined();
});

test("a currency that is neither a code nor normalisable throws instead of becoming ILS", () => {
  expect(() => bkmvNormaliseCurrency("shekel", { field: 1218, documentNumber: "1" })).toThrow(
    /not defaulted to ILS/
  );
  expect(() => bkmvNormaliseCurrency("$", { field: 1218, documentNumber: "1" })).toThrow(/ISO-4217/);
});

test("a document whose currency column holds ₪ gets 1218=ILS and 1217 zero", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ currency: "₪", totalAmount: 110 })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const c100 = built.txtBuffer.toString("latin1").split("\r\n")[1];
  expect(at(c100, "C100", 1218)).toBe("ILS");
  // Not a foreign currency once normalised, so no foreign-currency total.
  expect(at(c100, "C100", 1217)).toBe("+" + "0".repeat(14));
  // The document's own total is still there, in 1223.
  expect(at(c100, "C100", 1223)).toBe("+" + "11000".padStart(14, "0"));
});

test("no document anywhere in a built file declares ILS and a foreign-currency total", () => {
  // A whole-file integrity check rather than a single-field one: the failure this
  // catches was two fields disagreeing, which no assertion on either one would see.
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [
      doc({ id: "a", documentNumber: "1", currency: "ILS", totalAmount: 100 }),
      doc({ id: "b", documentNumber: "2", currency: "₪", totalAmount: 110 }),
      doc({ id: "c", documentNumber: "3", currency: "NIS", totalAmount: 120 }),
      doc({ id: "d", documentNumber: "4", currency: "USD", totalAmount: 130 }),
      doc({ id: "e", documentNumber: "5", currency: "usd", totalAmount: 140 }),
    ],
    lineItems: [
      line({ documentId: "a", paymentMetadata: { kind: "item" } }),
      line({ documentId: "b", paymentMetadata: { kind: "item" } }),
      line({ documentId: "c", paymentMetadata: { kind: "item" } }),
      line({ documentId: "d", paymentMetadata: { kind: "item" } }),
      line({ documentId: "e", paymentMetadata: { kind: "item" } }),
    ],
    primaryIdentifier: IDENT,
  });

  const c100s = built.txtBuffer
    .toString("latin1")
    .split("\r\n")
    .filter((l) => l.startsWith("C100"));

  expect(c100s).toHaveLength(5);

  const contradictions = c100s
    .map((l) => ({
      documentNumber: at(l, "C100", 1204).trim(),
      currency: at(l, "C100", 1218),
      foreignTotal: at(l, "C100", 1217),
    }))
    .filter((r) => r.currency === "ILS" && r.foreignTotal.replace(/[+\-0]/g, "") !== "");

  expect(contradictions).toEqual([]);

  // And the converse still works: a genuinely foreign document does carry one.
  const usd = c100s.filter((l) => at(l, "C100", 1218) === "USD");
  expect(usd).toHaveLength(2);
  for (const l of usd) {
    expect(at(l, "C100", 1217).replace(/[+\-0]/g, "")).not.toBe("");
  }

  // Three shekel documents, spelled three different ways in the column.
  expect(c100s.filter((l) => at(l, "C100", 1218) === "ILS")).toHaveLength(3);
});

// ------------------------------------------ amounts that do not add up

test("a document whose amounts do not add up is counted, and its figures are left alone", () => {
  // total says 1.10, subtotal and VAT say nothing — five real documents look like this.
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ subtotal: 0, vatAmount: 0, totalAmount: 1.1 })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  expect(built.notes.amountMismatches).toEqual([
    { documentNumber: "1156", beforeVat: 0, vat: 0, total: 1.1 },
  ]);

  // And nothing was repaired: the file still carries exactly what the database holds.
  const c100 = built.txtBuffer.toString("latin1").split("\r\n")[1];
  expect(at(c100, "C100", 1221)).toBe("+" + "0".repeat(14));
  expect(at(c100, "C100", 1222)).toBe("+" + "0".repeat(14));
  expect(at(c100, "C100", 1223)).toBe("+" + "110".padStart(14, "0"));
});

test("a document whose amounts do add up is not counted", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ subtotal: 0.85, vatAmount: 0.15, totalAmount: 1.0 })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });
  expect(built.notes.amountMismatches).toEqual([]);
});

/**
 * ⛔ A receipt's 1221 and 1222 are zero by definition, so the mismatch check must not fire.
 *
 * Measured on the first demo export: three of ten documents were receipts, and all three were
 * reported as amount mismatches because 0 + 0 never equals the amount received. A note that
 * always fires is a note nobody reads.
 */
test("a receipt with no taxable base is not reported as a mismatch", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ documentType: "receipt", subtotal: 0, vatAmount: 0, vatRate: 0, totalAmount: 1500 })],
    lineItems: [line({ description: "מזומן", paymentMetadata: { kind: "payment" } })],
    primaryIdentifier: IDENT,
  })
  expect(built.notes.amountMismatches).toEqual([])
})

/** But a receipt carrying a partial base IS inconsistent, and is still reported. */
test("a receipt with a partial subtotal is still reported", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ documentType: "receipt", subtotal: 500, vatAmount: 0, vatRate: 0, totalAmount: 1500 })],
    lineItems: [line({ description: "מזומן", paymentMetadata: { kind: "payment" } })],
    primaryIdentifier: IDENT,
  })
  expect(built.notes.amountMismatches).toHaveLength(1)
})

test("a VAT-exempt document, where the VAT is legitimately zero, is not counted", () => {
  // 39 of the 121 look like this: subtotal equals total and the rate is zero.
  const built = buildBkmvTxt({
    ctx: CTX,
    documents: [doc({ subtotal: 11, vatAmount: 0, vatRate: 0, totalAmount: 11 })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });
  expect(built.notes.amountMismatches).toEqual([]);
});

test("field 1225 stays empty rather than being derived from free text", () => {
  const built = buildBkmvTxt({
    ctx: CTX,
    // A name and a tax id are present, and neither becomes a key.
    documents: [doc({ customerName: "לקוח בדיקה", customerTaxId: "123456782", customerNumber: null })],
    lineItems: [line({ paymentMetadata: { kind: "item" } })],
    primaryIdentifier: IDENT,
  });

  const c100 = built.txtBuffer.toString("latin1").split("\r\n")[1];
  expect(at(c100, "C100", 1225)).toBe(" ".repeat(15));
  // The customer is still identified by name and VAT number, which do have sources.
  expect(at(c100, "C100", 1215)).toBe("123456782");
});
