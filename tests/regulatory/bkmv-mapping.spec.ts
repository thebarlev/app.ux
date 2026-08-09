import { expect, test } from "@playwright/test";

import {
  BKMV_EXPORTABLE_DOCUMENT_TYPES,
  BKMV_PAYMENT_MEANS_NEEDS_ACCOUNTANT,
  bkmvIsExportableDocumentType,
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

test("the four document types map to the appendix-1 codes", () => {
  expect(bkmvDocumentTypeCode("tax_invoice")).toBe("305");
  expect(bkmvDocumentTypeCode("invoice_receipt")).toBe("320");
  expect(bkmvDocumentTypeCode("receipt")).toBe("400");
  expect(bkmvDocumentTypeCode("proforma")).toBe("300");
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

// ------------------------------------------------- whitelist and truncation

test("only document types with an appendix-1 code are exportable, and the lookup stays closed", () => {
  expect([...BKMV_EXPORTABLE_DOCUMENT_TYPES].sort()).toEqual([
    "invoice_receipt",
    "proforma",
    "receipt",
    "tax_invoice",
  ]);

  expect(bkmvIsExportableDocumentType("tax_invoice")).toBe(true);
  expect(bkmvIsExportableDocumentType("work_order")).toBe(false);
  expect(bkmvIsExportableDocumentType("delivery_note")).toBe(false);

  // Excluding a type from selection must not weaken the lookup: anything that
  // reaches it without a code still throws.
  expect(() => bkmvDocumentTypeCode("work_order")).toThrow(/closed table/);
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

  expect(built.truncations).toHaveLength(1);
  expect(built.truncations[0]).toMatchObject({
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
  expect(built.truncations).toEqual([]);
});
