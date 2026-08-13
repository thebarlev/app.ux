import "server-only";

import type { BkmvRecordCode } from "./types";

/**
 * Appendix 4 — "אפיון ממשק משתמש", the export module's dialog and its printed report.
 *
 * Transcribed from "הוראות להפקת קבצים במבנה אחיד", version 1.31, page 20, section 5.4.
 *
 * ── WHAT THE SPEC ASKS FOR ──────────────────────────────────────────────────
 *
 * A dialog, then a result screen, then the ability to print it:
 *
 *   "בעת הפעלת מודול 'הפקת הקבצים' תוצג למשתמש תיבת דו שיח בה המשתמש יידרש למלא את
 *    הפרמטרים הבאים: הכונן הרצוי למיקום שמירת הנתונים / בית העסק הנבחר (אם אין צורך
 *    בבחירה יופיע שם בית העסק באופן אוטומטי) / טווח תאריכים: מתאריך (DDMMYYYY) ועד
 *    תאריך (DDMMYYYY) בתוכנה רב שנתית, או שנת המס (YYYY) בתוכנה חד שנתית."
 *
 *   "לאחר מילוי פרטים אלו ואישורם ע\"י המשתמש יתבצע תהליך העיבוד בו ייווצרו הקבצים כפי
 *    שמתואר בסעיף 2. בתום העיבוד יוצג מסך בו יפורטו הנתונים כדלקמן. תינתן אפשרות
 *    להדפיס נתונים אלה כדו\"ח."
 *
 * ── THE RECORD TABLE IS NOT INI.TXT'S SUMMARY ───────────────────────────────
 *
 * ⚠️ These are two different tables and it is easy to reuse the wrong one.
 *
 * INI.TXT summarises the DATA records only — C100, D110, D120 — because A100 and Z900 are
 * the envelope (see BKMV_SUMMARISED_RECORD_CODES in ini.ts). Appendix 4's printed table
 * lists **all eight** record types including the envelope, in the order printed on page 20,
 * and carries the spec's own Hebrew description for each.
 *
 * The one rule they share is the footnote, quoted verbatim on page 20:
 *
 *   "הערה: השורה תופיע במידה וקיימות רשומות מסוג זה"
 *
 * So a type with no records gets no row — not a row reading zero. B100, B110 and M100 are
 * in the table below and will never appear in a report, because this system does not
 * produce bookkeeping entries or inventory records.
 */

/**
 * The eight rows, in the order and with the descriptions printed on page 20.
 *
 * Descriptions are the spec's, not ours. "פרטי קבלות" for D120 rather than "שורת תשלום",
 * "פריטים במלאי" for M100 rather than "מלאי" — an auditor comparing the printout against
 * page 20 should find the same words.
 */
export const BKMV_APPENDIX_4_RECORD_TABLE: ReadonlyArray<{
  code: BkmvRecordCode;
  description: string;
}> = [
  { code: "A100", description: "רשומה פתיחה" },
  { code: "B100", description: "תנועות בהנהלת חשבונות" },
  { code: "B110", description: "חשבון בהנהלת חשבונות" },
  { code: "C100", description: "כותרת מסמך" },
  { code: "D110", description: "פרטי מסמך" },
  { code: "D120", description: "פרטי קבלות" },
  { code: "M100", description: "פריטים במלאי" },
  { code: "Z900", description: "רשומת סיום" },
];

export type BkmvAppendix4Row = {
  code: BkmvRecordCode;
  description: string;
  count: number;
};

/**
 * The rows the printed report should carry, given what BKMVDATA.TXT actually emitted.
 *
 * Applies page 20's footnote: a type with no records is absent, not zero. Takes
 * `recordCounts` straight from `buildBkmvTxt`, so the printed table is counted from the
 * records that were written rather than recomputed from the documents — a report that
 * counts the source instead of the output is a report that cannot detect a builder bug.
 */
export function bkmvAppendix4RecordRows(
  counts: Partial<Record<BkmvRecordCode, number>>
): BkmvAppendix4Row[] {
  return BKMV_APPENDIX_4_RECORD_TABLE.filter((r) => (counts[r.code] ?? 0) > 0).map((r) => ({
    code: r.code,
    description: r.description,
    count: counts[r.code] as number,
  }));
}

/**
 * The production date and time for the report's closing line, in the spec's formats.
 *
 * Page 20: "הנתונים הופקו באמצעות תוכנת XXX, מספר תעודת הרישום: XXX בתאריך DD/MM/YY
 * בשעה hh:mm." — a two-digit year, and hh:mm.
 *
 * ── ⛔ WHY THIS IS COMPUTED ON THE SERVER AND NOT IN THE BROWSER ─────────────
 *
 * The same instant appears twice in the report: here, and inside the directory name
 * `OPENFRMT\<8 digits>.<YY>\<MMDDhhmm>` that the report prints as the save path. The
 * directory is built by `bkmvExportDirectory` from the SERVER's local clock
 * (`getMonth`/`getDate`/`getHours`), and on Vercel that clock is UTC.
 *
 * A browser formatting the same ISO timestamp would use the viewer's timezone, so a report
 * printed in Israel would state 21:53 beside a path ending 1853 — a printed document
 * contradicting itself on the page, and the first thing a reader would notice. Both values
 * are therefore derived here, from one Date, with the same local getters, and the test
 * suite asserts that the hhmm in the path equals the hh:mm on the line.
 */
export function bkmvProducedAtStamp(at: Date): { date: string; time: string } {
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${two(at.getDate())}/${two(at.getMonth() + 1)}/${two(at.getFullYear() % 100)}`,
    time: `${two(at.getHours())}:${two(at.getMinutes())}`,
  };
}

/**
 * The date range as the dialog and the report print it: DDMMYYYY.
 *
 * Page 20 prints the range in both places in that format, without separators. Takes the
 * `YYYY-MM-DD` the API is given, so the report states the range that was actually
 * exported rather than what a form field held.
 */
export function bkmvRangeDDMMYYYY(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  return `${d}${mo}${y}`;
}
