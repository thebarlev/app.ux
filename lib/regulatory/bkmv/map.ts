import "server-only";

import {
  bkmvClearingHouseCode,
  bkmvCreditDealCode,
  bkmvDocumentTypeCode,
  bkmvNormaliseCurrency,
  bkmvPaymentMeansCode,
} from "./codes";
import type { BkmvCurrencyNormalisation } from "./codes";
import { transliterate } from "./text";
import type { BkmvTransliteration } from "./text";
import { encodeIso88598i } from "./encoding";
import { formatDateYYYYMMDD, formatTimeHHMM } from "./format";
import { BkmvError } from "./errors";
import { BKMV_DECLARED_VALUES } from "./spec";
import type { BkmvContext, BkmvDocument, BkmvLineItem, BkmvLineRole } from "./types";

/**
 * Maps database rows onto field numbers.
 *
 * Values are keyed by the spec's own field numbers because the published tables
 * carry no English names. Anything absent from a map is rendered by the field's
 * own rule — zeros for a numeric field, spaces for an alphanumeric one, per
 * section 2.3 — so a field with no source is simply left out here and the reason
 * is recorded beside it.
 */

/** Digits only, for a numeric field fed from a TEXT column. */
function digits(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const only = String(value).replace(/\D/g, "");
  return only.length > 0 ? only : undefined;
}

/** One truncation that happened, so it can be reported rather than absorbed. */
export type BkmvTruncation = {
  field: number;
  documentNumber: string | null;
  lineNumber: number;
  width: number;
  original: string;
  written: string;
};

/**
 * Cuts a value down to the columns the field has.
 *
 * Approved data loss, and the only thing that fits: the field is fixed width and
 * the instructions provide no continuation field. Every cut is pushed to the sink
 * so the caller can report it with the original value.
 *
 * **By characters, and that is the same as columns here** — this is verified, not
 * assumed: `encodeIso88598i` emits exactly one byte per character for everything
 * it accepts (ASCII and the 22 Hebrew letters), so a 30-character cut occupies 30
 * columns. The assertion below holds the property at runtime, and a test pins it.
 */
function truncate(
  value: string,
  width: number,
  meta: { field: number; documentNumber: string | null; lineNumber: number },
  sink?: BkmvTruncation[]
): string {
  if (value.length <= width) return value;

  const written = value.slice(0, width);
  if (encodeIso88598i(written).length !== width) {
    throw new BkmvError(
      "BKMV_FORMAT_VALIDATION",
      "A truncated value does not occupy the expected number of columns; one character is not one byte here",
      { field: meta.field, width, chars: written.length, bytes: encodeIso88598i(written).length }
    );
  }

  sink?.push({ ...meta, width, original: value, written });
  return written;
}

/**
 * Everything a record wants to report about how it had to bend the data to fit.
 * Threaded through rather than logged, so the caller can hand it to a human.
 */
export type BkmvExportNotes = {
  truncations: BkmvTruncation[];
  transliterations: BkmvTransliteration[];
  currencyNormalisations: BkmvCurrencyNormalisation[];
};

export function emptyNotes(): BkmvExportNotes {
  return { truncations: [], transliterations: [], currencyNormalisations: [] };
}

function plainText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Binds a record's identity to the text pipeline, so every alphanumeric value goes
 * through transliteration with the right field number attached.
 *
 * Transliteration comes first and truncation second: `…` becomes three characters,
 * so the width a field must satisfy is the width AFTER transliteration.
 */
function textFor(
  documentNumber: string | null,
  lineNumber: number,
  notes: BkmvExportNotes | undefined
) {
  return (field: number, value: unknown): string | undefined => {
    const s = plainText(value);
    if (s === undefined) return undefined;
    return transliterate(s, { field, documentNumber, lineNumber }, notes?.transliterations);
  };
}

/** The ISO date part of a timestamp, or undefined. */
function isoDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : undefined;
}

function dateField(value: string | null): string | undefined {
  const d = isoDate(value);
  return d ? formatDateYYYYMMDD(d) : undefined;
}

function timeField(value: string | null): string | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : formatTimeHHMM(at);
}

/**
 * Decides whether a line is goods or payment.
 *
 * There is no column for this, so it is derived, in order of how much the source
 * actually tells us:
 *
 *  1. `payment_metadata.kind` — the internal billing provider writes `"item"` or
 *     `"payment"` explicitly (lib/billing/vow-billing/providers/internal-provider.ts:249,273).
 *     When present it is authoritative.
 *  2. A `receipt` (400) has nothing but payment lines by construction: the manual
 *     path only ever writes payments for it (lib/documents/actions.ts:798-804).
 *  3. Otherwise goods. For an item-type document the manual path writes only
 *     goods, and its payment rows are dropped before they reach the database —
 *     which is why 50 of 107 issued 320s have no payment line at all.
 */
export function classifyLine(line: BkmvLineItem, document: BkmvDocument): BkmvLineRole {
  const kind = line.paymentMetadata?.kind;
  if (kind === "payment") return "payment";
  if (kind === "item") return "goods";
  if (document.documentType === "receipt") return "payment";
  return "goods";
}

export function bkmvA100Values(params: {
  ctx: BkmvContext;
  recordNumber: number;
  primaryIdentifier: string;
}): Record<number, unknown> {
  return {
    1101: params.recordNumber,
    1102: digits(params.ctx.companyTaxId),
    1103: params.primaryIdentifier,
    1104: BKMV_DECLARED_VALUES.systemConstant,
    // 1105 שטח לנתונים עתידיים — reserved, spaces per section 2.4.ט(1).
    1105: " ",
  };
}

export function bkmvZ900Values(params: {
  ctx: BkmvContext;
  recordNumber: number;
  primaryIdentifier: string;
  totalRecords: number;
}): Record<number, unknown> {
  return {
    1151: params.recordNumber,
    1152: digits(params.ctx.companyTaxId),
    1153: params.primaryIdentifier,
    1154: BKMV_DECLARED_VALUES.systemConstant,
    1155: params.totalRecords,
    // 1156 שטח לנתונים עתידיים — reserved, spaces.
    1156: " ",
  };
}

export function bkmvC100Values(params: {
  ctx: BkmvContext;
  document: BkmvDocument;
  recordNumber: number;
  /** The internal number linking this header to its lines — fields 1234/1273/1323. */
  linkNumber: number;
  notes?: BkmvExportNotes;
}): Record<number, unknown> {
  const { document: d, ctx } = params;
  const code = bkmvDocumentTypeCode(d.documentType);
  const t = textFor(d.documentNumber, -1, params.notes);
  // Normalised once, then used by every field that depends on the currency.
  const currency = bkmvNormaliseCurrency(
    d.currency,
    { field: 1218, documentNumber: d.documentNumber },
    params.notes?.currencyNormalisations
  );

  return {
    1201: params.recordNumber,
    1202: digits(ctx.companyTaxId),
    1203: code,
    1204: t(1204, d.documentNumber),
    // 1205 תאריך הפקת מסמך — the date the system set, which is finalized_at, not
    // issue_date. Clarification 12 distinguishes them explicitly.
    1205: dateField(d.finalizedAt) ?? dateField(d.issueDate),
    1206: timeField(d.finalizedAt),
    1207: t(1207, d.customerName),
    // 1208 מען הלקוח - רחוב. documents.customer_address is one TEXT column for the
    // whole address, so it goes to the street field whole; 1209 has no source.
    1208: t(1208, d.customerAddress),
    // 1209 מען הלקוח - מס בית — NO SOURCE. No house-number column exists; the
    // number is presumably inside the address string. Left out: spaces.
    1210: t(1210, d.customerCity),
    1211: t(1211, d.customerPostalCode),
    // 1212 מען הלקוח - מדינה — NO SOURCE. customers.address_country holds a code,
    // not a name, and it belongs in 1213. Left out: spaces.
    1213: t(1213, d.customerCountry),
    1214: t(1214, d.customerPhone),
    1215: digits(d.customerTaxId),
    // 1216 תאריך ערך — NO SOURCE. No value-date column is written by issuance.
    // Left out: zeros.
    /*
     * 1217 סכום סופי במט"ח — only meaningful in a foreign currency, so it is
     * derived from `currency` too. Both fields read the SAME normalised value,
     * computed once above: deriving 1217 from the raw column while 1218 read the
     * normalised one put a foreign-currency total on three shekel documents whose
     * column held "₪", because "₪" !== "ILS" is true. One source, so they cannot
     * disagree again.
     */
    1217: currency && currency !== "ILS" ? d.totalAmount : undefined,
    1218: currency,
    // 1219 סכום המסמך לפני הנחת מסמך. With no document-level discount this equals
    // 1221 by construction.
    1219: d.subtotal,
    // 1220 הנחת מסמך — NO SOURCE. Discounts exist per line only. Left out: zeros.
    1221: d.subtotal,
    1222: d.vatAmount,
    1223: d.totalAmount,
    // 1224 סכום הניכוי במקור — NO SOURCE. Left out: zeros. Note that were it ever
    // populated, clarification 4 requires it POSITIVE, unlike a discount.
    1225: t(1225, d.customerNumber),
    // 1226 שדה התאמה — NO SOURCE. Left out: spaces.
    // 1228 מסמך מבוטל. The instructions do not state which character to write, so
    // this marks a cancelled document with "1" and leaves anything else blank.
    1228: d.documentStatus === "cancelled" || d.documentStatus === "voided" ? "1" : undefined,
    1230: dateField(d.issueDate),
    // 1231 מזהה סניף/ענף — conditional on field 1034 being 1, and it is 0. Spaces.
    // 1233 מבצע הפעולה — NO SOURCE. created_by is a UUID and the field is X(9).
    1234: params.linkNumber,
    // 1235 שטח לנתונים עתידיים — reserved, spaces.
    1235: " ",
  };
}

export function bkmvD110Values(params: {
  ctx: BkmvContext;
  document: BkmvDocument;
  line: BkmvLineItem;
  recordNumber: number;
  linkNumber: number;
  notes?: BkmvExportNotes;
}): Record<number, unknown> {
  const { document: d, line, ctx } = params;
  const t = textFor(d.documentNumber, line.lineNumber, params.notes);
  const description = t(1260, line.description);

  return {
    1251: params.recordNumber,
    1252: digits(ctx.companyTaxId),
    1253: bkmvDocumentTypeCode(d.documentType),
    1254: t(1254, d.documentNumber),
    1255: line.lineNumber,
    // 1256 סוג מסמך בסיס / 1257 מספר מסמך בסיס — NO SOURCE. Nothing records what
    // a document is based on; voiding_document_id is a cancellation link, not a
    // base. Left out: zeros and spaces.
    // 1258 סוג עסקה — NO SOURCE. Left out: zeros.
    1259: t(1259, line.itemCode),
    // 1260 — X(30), mandatory. Product descriptions are unbounded in the database,
    // so longer ones are cut to 30 characters. Approved, lossy, and counted.
    1260:
      description === undefined
        ? undefined
        : truncate(
            description,
            30,
            { field: 1260, documentNumber: d.documentNumber, lineNumber: line.lineNumber },
            params.notes?.truncations
          ),
    // 1261 שם היצרן · 1262 מספר סידורי · 1263 תיאור יחידת מידה — NO SOURCE.
    // Left out: spaces.
    1264: line.quantity,
    1265: line.unitPrice,
    // 1266 הנחת שורה — negative, per section י"ב: its meaning is a reduction of
    // the line total. The column stores it as a positive magnitude.
    1266: line.discountAmount === null || line.discountAmount === undefined
      ? undefined
      : -Math.abs(line.discountAmount),
    1267: line.lineTotal,
    // 1268 שיעור המע"מ בשורה. The rate is stored on the document, not the line —
    // the only rate this system has. Unsigned, so no sign column.
    1268: d.vatRate,
    // 1270 מזהה סניף/ענף — conditional on 1034=1, and it is 0. Spaces.
    1272: dateField(d.issueDate),
    1273: params.linkNumber,
    // 1274 מזהה סניף של מסמך הבסיס — NO SOURCE, and no base document. Spaces.
    // 1275 שטח לנתונים עתידיים — reserved, spaces.
    1275: " ",
  };
}

export function bkmvD120Values(params: {
  ctx: BkmvContext;
  document: BkmvDocument;
  line: BkmvLineItem;
  recordNumber: number;
  linkNumber: number;
  notes?: BkmvExportNotes;
}): Record<number, unknown> {
  const { document: d, line, ctx } = params;
  const t = textFor(d.documentNumber, line.lineNumber, params.notes);
  const meta = line.paymentMetadata ?? {};

  return {
    1301: params.recordNumber,
    1302: digits(ctx.companyTaxId),
    1303: bkmvDocumentTypeCode(d.documentType),
    1304: t(1304, d.documentNumber),
    1305: line.lineNumber,
    // 1306 סוג אמצעי התשלום, mandatory. The means is stored as a Hebrew label in
    // the line's description (lib/types/receipt.ts:281); codes.ts maps the closed
    // list of 21 onto the spec's nine and throws on anything unmapped.
    1306: bkmvPaymentMeansCode(line.description),
    // 1307 מספר הבנק. The column holds a bank NAME as free text and the field is
    // 9(10) numeric, so only digits survive — which for a name is nothing. Kept
    // wired rather than dropped, so it starts working the day the column does.
    1307: digits(line.bankName),
    1308: digits(line.branch),
    1309: digits(line.accountNumber),
    1310: digits(meta.checkNumber),
    // 1311 תאריך הפירעון של ההמחאה — NO SOURCE. payment_metadata has no such key.
    // Left out: zeros.
    1312: line.lineTotal,
    1313: bkmvClearingHouseCode(meta.cardType),
    1314: t(1314, meta.cardLastDigits ?? meta.cardType),
    1315: bkmvCreditDealCode(meta.cardDealType),
    // 1316-1319 are cancelled X(0) fields and occupy no columns.
    // 1320 מזהה סניף/ענף — conditional on 1034=1, and it is 0. Spaces.
    1322: dateField(line.itemDate) ?? dateField(d.issueDate),
    1323: params.linkNumber,
    // 1324 שטח לנתונים עתידיים — reserved, spaces.
    1324: " ",
  };
}
