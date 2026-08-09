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
 * The four types this system issues:
 *   `tax_invoice`     → 305  חשבונית-מס
 *   `invoice_receipt` → 320  חשבונית מס / קבלה
 *   `receipt`         → 400  קבלה
 *   `proforma`        → 300  חשבונית/חשבונית עסקה
 *
 * `credit_note` → 330 is deliberately absent: credit-note issuance is blocked in
 * this system, so a 330 cannot exist and must not be silently exportable.
 */
const DOCUMENT_TYPE_CODES: Record<string, string> = {
  tax_invoice: "305",
  invoice_receipt: "320",
  receipt: "400",
  proforma: "300",
};

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
