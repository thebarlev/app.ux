/**
 * Types for the BKMV ("מבנה אחיד") fixed-length export, version 1.31.
 *
 * The field tables themselves are NOT written here. They are imported from
 * `docs/regulatory/bkmv/fields-1.31.json`, which is the single source of truth —
 * see `fields.ts`.
 */

/** The ten record types described by the spec. `INI-SUM` is a template, not a code — see `BkmvRecordSpec`. */
export type BkmvRecordKey =
  | "A000"
  | "INI-SUM"
  | "A100"
  | "Z900"
  | "C100"
  | "D110"
  | "D120"
  | "B100"
  | "B110"
  | "M100";

/** The four-character code actually written into a record's code field. */
export type BkmvRecordCode = "A000" | "A100" | "Z900" | "C100" | "D110" | "D120" | "B100" | "B110" | "M100";

/** How the spec marks a field: ח / ח-ר / חמ. */
export type BkmvRequirement = "mandatory" | "optional" | "conditional";

export type BkmvAlign = "left" | "right";

type BkmvFieldBase = {
  /** The spec's own field number (1000, 1001, …). Globally unique across all ten records; the stable identifier. */
  no: number;
  /** Description verbatim from the spec, in Hebrew. */
  desc: string;
  /** The notation verbatim, e.g. "X(20)", "9(9)", "X9(12)v99". Kept for traceability. */
  tech: string;
  /**
   * Columns consumed. **Zero for the cancelled `X(0)` fields**, which carry a
   * notational `from == to` while occupying no columns at all. Never derive a
   * width from `from`/`to`.
   */
  width: number;
  /** Start column as printed in the spec. Reference only — not used to compute widths. */
  from: number;
  /** End column as printed in the spec. Reference only — not used to compute widths. */
  to: number;
  requirement: BkmvRequirement;
};

/** `X(n)` — left aligned, space padded. */
export type BkmvAlphanumericField = BkmvFieldBase & {
  kind: "alphanumeric";
};

/** `9(n)` — right aligned, zero padded. */
export type BkmvNumericField = BkmvFieldBase & {
  kind: "numeric";
  digits: number;
};

/**
 * `9(n)v9(m)` and `X9(n)v9(m)` — a fixed-point amount.
 *
 * The decimal point is **implied and never written**: `9(2)v99` holds 17.5 as
 * `1750`, four columns, no separator anywhere.
 *
 * When `signed` is true the leading `X` is a **sign column of its own**, one
 * character wide, carried in addition to the digits. It is not a minus glued to
 * the front of the number: `X9(12)v99` is 1 + 12 + 2 = 15 columns, and the sign
 * occupies its own column whether the value is negative or not.
 */
export type BkmvAmountField = BkmvFieldBase & {
  kind: "amount";
  /** True when the notation carries a leading `X` — one extra column for the sign. */
  signed: boolean;
  /** Digits before the implied point. */
  intDigits: number;
  /** Digits after the implied point. */
  decDigits: number;
};

export type BkmvFieldSpec = BkmvAlphanumericField | BkmvNumericField | BkmvAmountField;

export type BkmvRecordSpec = {
  key: BkmvRecordKey;
  /** Description verbatim from the spec. */
  name: string;
  /** The record's total width in columns, as published. */
  recordLength: number;
  /** False for the records excluded by the scope decision of 9.8.2026 — B100, B110, M100. */
  inScope: boolean;
  /**
   * The field that carries the four-character record code.
   *
   * For every record except `INI-SUM` this is a constant equal to the record
   * key. `INI-SUM` is a **template**: one summary line is emitted per record
   * type present in BKMVDATA.TXT, and its field 1050 carries the code of the
   * type being summarised. That is why the emitted code is supplied by the
   * caller and is not read off the record key.
   */
  codeFieldNo: number;
  fields: BkmvFieldSpec[];
};

export type BkmvSpec = {
  version: string;
  /**
   * Deliberately partial. A record that is out of scope may be absent
   * altogether, and every lookup must handle a miss.
   */
  records: Partial<Record<BkmvRecordKey, BkmvRecordSpec>>;
};

export type BkmvContext = {
  companyId: string;
  companyTaxId: string; // ח.פ / עוסק
  companyName: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  generatedAtIso: string; // ISO timestamp
};

export type BkmvDocument = {
  id: string;
  documentType: string;
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD — documents.issue_date, field 1230
  /** documents.finalized_at — field 1205, the date the system set, per clarification 12. */
  finalizedAt: string | null;
  createdAt: string;
  /** documents.document_status — field 1228 is set for cancelled/voided. */
  documentStatus: string | null;
  currency: string | null;
  totalAmount: number | null;
  subtotal: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  customerName: string | null;
  customerTaxId: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  /** From `customers`, present only when the document carries a customer_id. */
  customerCity: string | null;
  customerPostalCode: string | null;
  customerCountry: string | null;
  customerNumber: string | null;
};

export type BkmvLineItem = {
  documentId: string;
  lineNumber: number;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  discountAmount: number | null;
  lineTotal: number | null;
  currency: string | null;
  /** document_line_items.item_date — a payment line's own date. */
  itemDate: string | null;
  itemCode: string | null;
  bankName: string | null;
  branch: string | null;
  accountNumber: string | null;
  paymentMetadata: Record<string, unknown> | null;
};

/**
 * What a line item is for. The file needs to know, because a goods line becomes
 * D110 and a payment line becomes D120, and both live in `document_line_items`.
 *
 * There is no column that says which. The discriminator is derived — see
 * `classifyLine` in `map.ts`.
 */
export type BkmvLineRole = "goods" | "payment";
