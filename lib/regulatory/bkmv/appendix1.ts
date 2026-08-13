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
 * database. It says: this is a document type we tell the registrar we issue. Five are
 * declared. The other twenty-two report zero and always will until one of them is built.
 *
 * ⚠️ It is deliberately separate from DOCUMENT_TYPE_CODES in codes.ts, which maps our
 * internal document_type strings onto these codes for the export. Those two lists answer
 * different questions. They agree today except on 330, which is declared here and absent
 * there because credit-note issuance is blocked — so it reports zero and produces nothing
 * in the file until that work lands. Anything declared here and missing there yields zeros
 * in the report and nothing in the file, which is a discrepancy worth seeing.
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

export const BKMV_APPENDIX_1: readonly Appendix1Row[] = [
  { code: "100", name: "הזמנה", managed: true, internalTypes: ["work_order"] },
  /*
   * ⚠️ 200 is declared unmanaged while document_sequences holds a LOCKED delivery_note
   * sequence (measured 2026-08-13, still at its starting number 100). Nothing has been
   * issued against it, so the report reads zero truthfully today — but the lock means a
   * regulatory number could be spent on a type this file does not carry. See
   * BKMV_UNMAPPED_LOCKED_SEQUENCES in codes.ts.
   */
  { code: "200", name: "תעודת משלוח", managed: false, internalTypes: [] },
  { code: "205", name: "תעודת משלוח סוכן", managed: false, internalTypes: [] },
  { code: "210", name: "תעודת החזרה", managed: false, internalTypes: [] },
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
  { code: "500", name: "הזמנת רכש", managed: false, internalTypes: [] },
  { code: "600", name: "תעודת משלוח רכש", managed: false, internalTypes: [] },
  { code: "610", name: "החזרת רכש", managed: false, internalTypes: [] },
  { code: "700", name: "חשבונית מס רכש", managed: false, internalTypes: [] },
  { code: "710", name: "זיכוי רכש", managed: false, internalTypes: [] },
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
