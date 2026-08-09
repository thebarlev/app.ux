import "server-only";

import {
  bkmvClearingHouseCode,
  bkmvCreditDealCode,
  bkmvDocumentTypeCode,
  bkmvPaymentMeansCode,
} from "./codes";
import { formatDateYYYYMMDD, formatTimeHHMM } from "./format";
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

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
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
}): Record<number, unknown> {
  const { document: d, ctx } = params;
  const code = bkmvDocumentTypeCode(d.documentType);

  return {
    1201: params.recordNumber,
    1202: digits(ctx.companyTaxId),
    1203: code,
    1204: text(d.documentNumber),
    // 1205 תאריך הפקת מסמך — the date the system set, which is finalized_at, not
    // issue_date. Clarification 12 distinguishes them explicitly.
    1205: dateField(d.finalizedAt) ?? dateField(d.issueDate),
    1206: timeField(d.finalizedAt),
    1207: text(d.customerName),
    // 1208 מען הלקוח - רחוב. documents.customer_address is one TEXT column for the
    // whole address, so it goes to the street field whole; 1209 has no source.
    1208: text(d.customerAddress),
    // 1209 מען הלקוח - מס בית — NO SOURCE. No house-number column exists; the
    // number is presumably inside the address string. Left out: spaces.
    1210: text(d.customerCity),
    1211: text(d.customerPostalCode),
    // 1212 מען הלקוח - מדינה — NO SOURCE. customers.address_country holds a code,
    // not a name, and it belongs in 1213. Left out: spaces.
    1213: text(d.customerCountry),
    1214: text(d.customerPhone),
    1215: digits(d.customerTaxId),
    // 1216 תאריך ערך — NO SOURCE. No value-date column is written by issuance.
    // Left out: zeros.
    // 1217 סכום סופי במט"ח — only meaningful in foreign currency.
    1217: d.currency && d.currency !== "ILS" ? d.totalAmount : undefined,
    1218: text(d.currency),
    // 1219 סכום המסמך לפני הנחת מסמך. With no document-level discount this equals
    // 1221 by construction.
    1219: d.subtotal,
    // 1220 הנחת מסמך — NO SOURCE. Discounts exist per line only. Left out: zeros.
    1221: d.subtotal,
    1222: d.vatAmount,
    1223: d.totalAmount,
    // 1224 סכום הניכוי במקור — NO SOURCE. Left out: zeros. Note that were it ever
    // populated, clarification 4 requires it POSITIVE, unlike a discount.
    1225: text(d.customerNumber),
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
}): Record<number, unknown> {
  const { document: d, line, ctx } = params;

  return {
    1251: params.recordNumber,
    1252: digits(ctx.companyTaxId),
    1253: bkmvDocumentTypeCode(d.documentType),
    1254: text(d.documentNumber),
    1255: line.lineNumber,
    // 1256 סוג מסמך בסיס / 1257 מספר מסמך בסיס — NO SOURCE. Nothing records what
    // a document is based on; voiding_document_id is a cancellation link, not a
    // base. Left out: zeros and spaces.
    // 1258 סוג עסקה — NO SOURCE. Left out: zeros.
    1259: text(line.itemCode),
    1260: text(line.description),
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
}): Record<number, unknown> {
  const { document: d, line, ctx } = params;
  const meta = line.paymentMetadata ?? {};

  return {
    1301: params.recordNumber,
    1302: digits(ctx.companyTaxId),
    1303: bkmvDocumentTypeCode(d.documentType),
    1304: text(d.documentNumber),
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
    1314: text(meta.cardLastDigits ?? meta.cardType),
    1315: bkmvCreditDealCode(meta.cardDealType),
    // 1316-1319 are cancelled X(0) fields and occupy no columns.
    // 1320 מזהה סניף/ענף — conditional on 1034=1, and it is 0. Spaces.
    1322: dateField(line.itemDate) ?? dateField(d.issueDate),
    1323: params.linkNumber,
    // 1324 שטח לנתונים עתידיים — reserved, spaces.
    1324: " ",
  };
}
