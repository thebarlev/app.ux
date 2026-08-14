/**
 * Appendix 1 — the Tax Authority's table of document types.
 *
 * Transcribed from "הוראות להפקת קבצים במבנה אחיד", version 1.31, page 18, section 5.1.
 * Twenty-seven codes, in the order the spec prints them.
 *
 * ── WHY THE WHOLE TABLE AND NOT ONLY WHAT WE ISSUE ──────────────────────────
 *
 * Section 2.6 (page 9) requires, for software with a document-issuing module:
 *
 *   "דוח שיכלול לגבי כל אחד מהמסמכים הכלולים בנספח מספר 1 את כמות המסמכים ואת הסך
 *    הכספי שלהם. אם המסמך לא מנוהל על ידי התוכנה יש למלא אפס."
 *
 * So the report is a statement about the entire table, with zeros for what the software
 * does not manage — not a list of what it happens to produce. The spec's own example
 * proves the point: it shows type 200 with 45 documents and a total of 0, explaining
 * "בתוכנה מנוהלות תעודות משלוח ותעודות החזרה, אולם אין בהן ציון של סכומים".
 *
 * ── ⛔ 406 IS NOT IN THIS TABLE ─────────────────────────────────────────────
 *
 * A working list circulated that included "406 קבלה על פיקדון". It is not in appendix 1.
 * The nearest entries are 405 (קבלה על תרומות) and 420 (הפקדת בנק). Declaring 406 would
 * declare a code the Tax Authority does not define, so it is absent here on purpose.
 *
 * ── WHAT "MANAGED" MEANS BELOW ──────────────────────────────────────────────
 *
 * `managed: true` is a DECLARATION about this software, not a fact derived from the
 * database. It says: this is a document type we tell the registrar we issue. Eleven are
 * declared. The other sixteen report zero and always will until one of them is built.
 *
 * ⚠️ It is deliberately separate from DOCUMENT_TYPE_CODES in codes.ts, which maps our
 * internal document_type strings onto these codes for the export. Those two lists answer
 * different questions. As of 14.8.2026 they agree on all eleven, 330 included — the
 * credit-note mapping landed, and the submission file carries 62 of them. Anything
 * declared here and missing there yields zeros in the report and nothing in the file,
 * which is a discrepancy worth seeing.
 */

export type Appendix1Row = {
  /** The code as it appears in field 1203 / 1253, printed as three digits. */
  code: string
  /** The Hebrew name, transcribed from page 18 without alteration. */
  name: string
  /** Whether this software declares that it issues this type. */
  managed: boolean
  /** Our internal document_type values that map onto this code, if any. */
  internalTypes: readonly string[]
}

/*
 * ⛔ ELEVEN CODES ARE DECLARED, and this file must agree with codes.ts.
 *
 * On 14.8.2026 codes.ts gained proforma 300, return_note 210, purchase_order 500,
 * self_invoice 700 and self_credit_note 710 — and this file was left behind. The file carried
 * documents of all five while the section 2.6 report counted them as zero, because the report
 * reads `internalTypes` from here and the export reads DOCUMENT_TYPE_CODES from there.
 *
 * That is exactly the discrepancy the note below predicted, in the opposite direction: the two
 * lists answer different questions, and one of them was updated alone. A 2.6 report declaring
 * that five document types are not managed, filed beside a uniform file that carries them, is
 * two annexes contradicting each other in front of the registrar.
 *
 * ⚠️ Whoever maps a code in codes.ts must set it managed here in the same change.
 */
export const BKMV_APPENDIX_1: readonly Appendix1Row[] = [
  { code: "100", name: "הזמנה", managed: true, internalTypes: ["work_order"] },
  /*
   * 200 is declared MANAGED as of 2026-08-13. Its sequence was already locked in production and
   * its issuance route already reachable from the menu, so the file now carries what the
   * software can issue rather than leaving a locked sequence pointing at nothing. The decision
   * and its obligations are recorded in codes.ts.
   *
   * ⚠️ Section 2.6's example (page 9) shows this very type with 45 documents and a total of
   * zero — "בתוכנה מנוהלות תעודות משלוח ותעודות החזרה, אולם אין בהן ציון של סכומים". A delivery
   * note with no money on it is expected, not an error.
   */
  { code: "200", name: "תעודת משלוח", managed: true, internalTypes: ["delivery_note"] },
  { code: "205", name: "תעודת משלוח סוכן", managed: false, internalTypes: [] },
  { code: "210", name: "תעודת החזרה", managed: true, internalTypes: ["return_note"] },
  { code: "300", name: "חשבונית/חשבונית עסקה", managed: true, internalTypes: ["proforma"] },
  { code: "305", name: "חשבונית-מס", managed: true, internalTypes: ["tax_invoice"] },
  { code: "310", name: "חשבונית ריכוז", managed: false, internalTypes: [] },
  { code: "320", name: "חשבונית מס / קבלה", managed: true, internalTypes: ["invoice_receipt"] },
  { code: "330", name: "חשבונית מס זיכוי", managed: true, internalTypes: ["credit_note"] },
  { code: "340", name: "חשבונית שריון", managed: false, internalTypes: [] },
  { code: "345", name: "חשבונית סוכן", managed: false, internalTypes: [] },
  { code: "400", name: "קבלה", managed: true, internalTypes: ["receipt"] },
  { code: "405", name: "קבלה על תרומות", managed: false, internalTypes: [] },
  { code: "410", name: "יציאה מקופה", managed: false, internalTypes: [] },
  { code: "420", name: "הפקדת בנק", managed: false, internalTypes: [] },
  { code: "500", name: "הזמנת רכש", managed: true, internalTypes: ["purchase_order"] },
  { code: "600", name: "תעודת משלוח רכש", managed: false, internalTypes: [] },
  { code: "610", name: "החזרת רכש", managed: false, internalTypes: [] },
  { code: "700", name: "חשבונית מס רכש", managed: true, internalTypes: ["self_invoice"] },
  { code: "710", name: "זיכוי רכש", managed: true, internalTypes: ["self_credit_note"] },
  { code: "800", name: "יתרת פתיחה", managed: false, internalTypes: [] },
  { code: "810", name: "כניסה כללית למלאי", managed: false, internalTypes: [] },
  { code: "820", name: "יציאה כללית מהמלאי", managed: false, internalTypes: [] },
  { code: "830", name: "העברה בין מחסנים", managed: false, internalTypes: [] },
  { code: "840", name: "עדכון בעקבות ספירה", managed: false, internalTypes: [] },
  { code: "900", name: "דוח ייצור-כניסה", managed: false, internalTypes: [] },
  { code: "910", name: "דוח ייצור-יציאה", managed: false, internalTypes: [] },
]

/** Every internal document_type that appears anywhere in the table, for one query. */
export const APPENDIX_1_INTERNAL_TYPES: readonly string[] = BKMV_APPENDIX_1.flatMap((r) => r.internalTypes)

/** Code for one of our internal document_type strings, or null when it maps to nothing. */
export function appendix1CodeForInternalType(internalType: string): string | null {
  const row = BKMV_APPENDIX_1.find((r) => r.internalTypes.includes(internalType))
  return row ? row.code : null
}
