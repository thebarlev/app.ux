import { BkmvError } from "./errors";

/**
 * The code tables the file requires, and the mapping from this system's own
 * vocabulary onto them.
 *
 * Every table here is transcribed from the instructions. Where this system's
 * values do not line up one-to-one, the mapping decision is recorded next to the
 * entry rather than in a commit message.
 */

/**
 * Appendix 1 — document type, fields 1203 / 1253 / 1303, `9(3)`.
 *
 * Section 2.4.ה is explicit that only values from that table may be used, so this
 * is a closed mapping and an unrecognised type throws.
 *
 * The types this system issues:
 *   `tax_invoice`     → 305  חשבונית-מס
 *   `invoice_receipt` → 320  חשבונית מס / קבלה
 *   `receipt`         → 400  קבלה
 *   `work_order`      → 100  הזמנה
 *
 * ── ⛔ WHY work_order IS HERE, AND HOW IT WAS DECIDED ───────────────────────
 *
 * Not by preference. The test was whether its numbers come from a locked regulatory
 * sequence or from a counter that is merely convenient, and it was run against
 * production:
 *
 *   document_type      start  current  is_locked  locked_at
 *   work_order          1000     1003  true       2026-05-04T06:28:01
 *   work_order          3000     3000  true       2026-08-11T14:32:21
 *
 * Two locked sequences, one of them already advanced to 1003. A regulatory number that
 * was allocated and appears in no file is a gap in a sequence, and a gap in a sequence is
 * precisely what the registrar looks for. So it maps, and it is declared.
 *
 * `credit_note` → 330 is deliberately absent: credit-note issuance is blocked in
 * this system, so a 330 cannot exist and must not be silently exportable. It goes in with
 * the credit-note work, not before it.
 *
 * ⚠️ AND ONE THAT PASSES THE SAME TEST AND IS NOT HERE — see the note under
 * BKMV_UNMAPPED_LOCKED_SEQUENCES below. It is reported rather than decided.
 */
const DOCUMENT_TYPE_CODES: Record<string, string> = {
  tax_invoice: "305",
  invoice_receipt: "320",
  receipt: "400",
  work_order: "100",
};

/*
 * ⛔ WHY proforma → 300 WAS REMOVED — and a correction to the reason first recorded here.
 *
 * ⚠️ THE ORIGINAL REASON WAS WRONG. It said "form pages for proforma 0, form clients for
 * proforma 0". That came from searching for a per-type directory (app/dashboard/documents/
 * proforma/) and finding none. There is no per-type directory, and there does not need to
 * be: `app/business/documents/new/[documentType]/page.tsx` is a GENERIC form page that
 * serves proforma, workOrder, deliveryNote, quote, returnNote, purchaseOrder, selfInvoice
 * and selfCreditNote through TaxInvoiceFormClient, `getDocumentConfig` defines proforma, and
 * NewDocumentFab links to /business/documents/new/proforma unconditionally — it is one
 * menu click away. So an issuance path exists and the software CAN issue a proforma.
 *
 * What survives measurement, in production on 2026-08-13:
 *
 *   documents of type proforma   0, of any status, ever
 *
 * That is the whole of the evidence, and it is enough for the decision but not for the
 * original claim. The invariant this table carries is that a mapped code must have
 * documents behind it in the submitted data: a code declared with nothing behind it tells
 * the registrar we issue something we have never issued.
 *
 * ⚠️ So this is now a REVERSIBLE decision with a cheap condition, not a statement about a
 * missing feature: issue ten proformas through the existing form and the mapping earns its
 * place. It was removed because the submission data has none, not because none can exist.
 */

/**
 * ⚠️ Document types that draw from a LOCKED sequence and have no appendix-1 mapping.
 *
 * Measured in production on 2026-08-13:
 *
 *   delivery_note   start 100  current 100  is_locked true  locked_at 2026-05-04T14:25:08
 *
 * By the same test that put work_order in the table, delivery_note belongs there too —
 * appendix 1 gives it code 200, and a locked sequence means a regulatory number can be
 * allocated against it.
 *
 * It is NOT mapped here, and that is a deliberate refusal rather than an oversight: adding
 * it changes what enters the file we submit, and the declared list of types was set
 * without it. Its sequence is still at its starting number, so no number has actually been
 * spent — the hole is theoretical today and would become real on the first delivery note
 * issued.
 *
 * Whoever resolves this either maps it or unlocks the sequence. Leaving both as they are
 * is the one option that is wrong.
 */
export const BKMV_UNMAPPED_LOCKED_SEQUENCES: readonly string[] = ["delivery_note"];

/*
 * ⚠️ delivery_note, stage two — and the same correction applies, which makes it WORSE.
 *
 * This comment used to say "zero form pages, zero form clients ... nothing can produce one".
 * Wrong, for the reason above: /business/documents/new/deliveryNote exists, renders
 * TaxInvoiceFormClient, and NewDocumentFab links to it as "תעודת משלוח".
 *
 * What is measured is only this: zero delivery_note documents ever created, and a LOCKED
 * sequence sitting at its starting number.
 *
 * The earlier reading made the risk sound theoretical because no path existed. The truth is
 * the opposite — the path exists and is one menu click away, so the first person who uses it
 * allocates a regulatory number against a type this file does not carry. Same wrong state,
 * much shorter fuse.
 */

/**
 * The document types that belong in the file at all.
 *
 * The unified file describes accounting documents, and appendix 1 is a closed
 * table — so a type with no code in it is not something to map, it is something
 * that does not belong. The export selects by this list rather than taking every
 * final document and hoping each one has a code.
 *
 * Anything left out is counted and reported, never silently dropped.
 */
export const BKMV_EXPORTABLE_DOCUMENT_TYPES: readonly string[] = Object.keys(DOCUMENT_TYPE_CODES);

export function bkmvIsExportableDocumentType(documentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_TYPE_CODES, documentType);
}

export function bkmvDocumentTypeCode(documentType: string): string {
  const code = DOCUMENT_TYPE_CODES[documentType];
  if (!code) {
    throw new BkmvError(
      "BKMV_FORMAT_VALIDATION",
      `No BKMV document type code is mapped for "${documentType}". Appendix 1 is a closed table; add the mapping deliberately rather than guessing a code.`,
      { documentType, mapped: Object.keys(DOCUMENT_TYPE_CODES) }
    );
  }
  return code;
}

/**
 * Field 1306, "סוג אמצעי התשלום", `9(1)`, mandatory in D120.
 *
 * The instructions allow nine values:
 *   1 מזומן · 2 המחאה · 3 כ. אשראי · 4 העב. בנקאית · 5 תווי קניה ·
 *   6 תלוש החלפה · 7 שטר · 8 ה.קבע · 9 אחר
 *
 * This system stores the payment means as a Hebrew label in
 * `document_line_items.description` (see `lib/types/receipt.ts:281`), chosen from
 * a closed list of 21. Codes 6, 7 and 8 are unreachable — nothing in this system
 * records an exchange voucher, a promissory note or a standing order.
 *
 * The reasoning behind the non-obvious rows, so it lives in the code:
 *   · Google Pay and Apple Pay are card wrappers, so 3 rather than 9.
 *   · Bit, PayBox, Pay and Colu settle against a bank account, so 4.
 *   · International wallets and crypto have no counterpart in a 2009 table, so 9.
 *
 * An unrecognised label throws and names itself. It is **not** defaulted to 9: a
 * label added to the product later is a decision that has to reach a human, and a
 * silent 9 would bury it in a filed return.
 */
const PAYMENT_MEANS_CODES: Record<string, string> = {
  // 1 — מזומן
  "מזומן": "1",
  // 2 — המחאה
  "צ׳ק": "2",
  "V-CHECK": "2",
  // 3 — כ. אשראי. Google/Apple Pay wrap a card.
  "כרטיס אשראי": "3",
  "Google Pay": "3",
  "Apple Pay": "3",
  // 4 — העב. בנקאית. Bit, PayBox, Pay and Colu settle against a bank account.
  "העברה בנקאית": "4",
  Bit: "4",
  PayBox: "4",
  Pay: "4",
  Colu: "4",
  // 5 — תווי קניה
  "שובר BuyME": "5",
  "שובר מתנה": "5",
  // 9 — אחר. No 2009 counterpart.
  PayPal: "9",
  Payoneer: "9",
  "ביטקוין": "9",
  "אתריום": "9",
  "שווה כסף": "9",

  /*
   * ⚠️ THE THREE WITHHOLDING LABELS ARE NOT PAYMENT MEANS.
   *
   * "ניכוי במקור", "ניכוי חלק עובד טל״א" and "ניכוי אחר" are deductions — they
   * reduce what is owed rather than describing how it was paid. The instructions
   * have no code for a deduction in field 1306, and mapping them to 9 is a
   * placeholder, not an answer.
   *
   * **This requires an accountant's decision** on whether such a line belongs in
   * D120 at all, or belongs in field 1224 (withholding tax) on C100 instead.
   * Recorded in FOLLOWUPS and in docs/regulatory/bkmv/mapping.md; it is not
   * hidden in a comment on a table row.
   */
  "ניכוי במקור": "9",
  "ניכוי חלק עובד טל״א": "9",
  "ניכוי אחר": "9",

  /*
   * The fallback `paymentRowToLineItem` writes when the form's method is empty
   * (lib/types/receipt.ts:281). It says a payment happened and nothing about how,
   * so it is "other" rather than a guess at cash.
   */
  "תשלום": "9",
};

/** The labels whose mapping is a placeholder pending an accountant's ruling. */
export const BKMV_PAYMENT_MEANS_NEEDS_ACCOUNTANT: readonly string[] = [
  "ניכוי במקור",
  "ניכוי חלק עובד טל״א",
  "ניכוי אחר",
];

export function bkmvPaymentMeansCode(label: string): string {
  const code = PAYMENT_MEANS_CODES[(label || "").trim()];
  if (!code) {
    throw new BkmvError(
      "BKMV_FORMAT_VALIDATION",
      `No BKMV payment means code is mapped for the label "${label}". Field 1306 is mandatory and its table has nine values; a new payment method needs a deliberate mapping, not a fallback to 9.`,
      { label, mapped: Object.keys(PAYMENT_MEANS_CODES) }
    );
  }
  return code;
}

/**
 * Field 1313, "קוד החברה הסולקת", `9(1)`, optional.
 *
 * The instructions list 1 ישראכרט · 2 כאל · 3 דיינרס · 4 אמריקן אקספרס ·
 * 6 לאומי כארד. **The code 5 does not appear in the table** — that is how the
 * document reads, not an omission here.
 *
 * The stored `payment_metadata.cardType` is inconsistent across rows: the manual
 * form writes `visa`/`mastercard`/`isracard`/`amex`/`diners`/`other`, while the
 * internal billing provider writes a bare numeral. Only labels that map to a
 * listed clearing house are translated; everything else yields no value, which
 * leaves the optional field zero-filled rather than wrong.
 */
const CLEARING_HOUSE_CODES: Record<string, string> = {
  isracard: "1",
  "ישראכרט": "1",
  cal: "2",
  "כאל": "2",
  diners: "3",
  "דיינרס": "3",
  amex: "4",
  "אמריקן אקספרס": "4",
  leumicard: "6",
  "לאומי כארד": "6",
};

export function bkmvClearingHouseCode(cardType: unknown): string | undefined {
  if (typeof cardType !== "string") return undefined;
  const raw = cardType.trim();
  // A bare numeral is already a code, but only if the table has it.
  if (/^[12346]$/.test(raw)) return raw;
  return CLEARING_HOUSE_CODES[raw.toLowerCase()] ?? CLEARING_HOUSE_CODES[raw];
}

/**
 * Field 1315, "סוג עסקת האשראי", `9(1)`, optional.
 * 1 רגיל · 2 תשלומים · 3 קרדיט · 4 חיוב נדחה · 5 אחר.
 */
const CREDIT_DEAL_CODES: Record<string, string> = {
  regular: "1",
  payments: "2",
  credit: "3",
  deferred: "4",
  other: "5",
};

export function bkmvCreditDealCode(dealType: unknown): string | undefined {
  if (typeof dealType !== "string") return undefined;
  return CREDIT_DEAL_CODES[dealType.trim().toLowerCase()];
}

/** One currency code that had to be normalised, so it can be reported. */
export type BkmvCurrencyNormalisation = {
  field: number;
  documentNumber: string | null;
  original: string;
  written: string;
};

/**
 * Field 1218, "קוד מט\"ח", `X(3)`.
 *
 * Appendix 2 requires an ISO-4217 code. Four rows in `documents.currency` hold the
 * shekel **sign** rather than a code, so the sign is normalised on read — in the
 * export only. The documents themselves are not touched: `currency` is on the
 * blocked list of `enforce_document_immutability`, and an update to a final
 * document is supposed to be refused.
 *
 * Anything that is neither an ISO-4217-shaped code nor in the table below throws.
 * **It does not fall back to ILS**: silently defaulting a currency would put a
 * wrong code on a document's own amounts.
 */
const CURRENCY_NORMALISATIONS: Record<string, string> = {
  "\u20aa": "ILS", // ₪
  NIS: "ILS", // the pre-1998 code, still typed by hand
};

export function bkmvNormaliseCurrency(
  value: unknown,
  meta: { field: number; documentNumber: string | null },
  sink?: BkmvCurrencyNormalisation[]
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (raw.length === 0) return undefined;

  const normalised = CURRENCY_NORMALISATIONS[raw] ?? CURRENCY_NORMALISATIONS[raw.toUpperCase()];
  if (normalised) {
    sink?.push({ ...meta, original: raw, written: normalised });
    return normalised;
  }

  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();

  throw new BkmvError(
    "BKMV_FORMAT_VALIDATION",
    `"${raw}" is not an ISO-4217 currency code and has no approved normalisation. Field 1218 takes a code from appendix 2; it is not defaulted to ILS.`,
    { field: meta.field, documentNumber: meta.documentNumber, value: raw }
  );
}
