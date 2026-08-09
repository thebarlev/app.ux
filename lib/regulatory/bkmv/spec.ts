import { BkmvError } from "./errors";
import { BKMV_IN_SCOPE_KEYS, BKMV_RECORDS, bkmvRecordLengthReport } from "./fields";
import type { BkmvSpec } from "./types";

/**
 * The executable spec used by the generator.
 *
 * The field tables are imported from `docs/regulatory/bkmv/fields-1.31.json` via
 * `fields.ts`. That JSON is the single source of truth; `docs/regulatory/bkmv/spec.md`
 * is a stale narrative kept only for history.
 */

/**
 * Version of the Tax Authority instructions this implements: "הוראות להפקת קבצים
 * במבנה אחיד", 1.31, 10.05.2009.
 *
 * Not to be confused with 5.4, which is a **section number** inside those
 * instructions. An earlier revision of this file carried "5.4-TBD" as if it were
 * a version.
 */
export const BKMV_SPEC_VERSION = "1.31";

/**
 * Values the spec fixes for this vendor and this software. Declared here so that
 * nobody has to guess one later; the writer that consumes them is workplan
 * stage 5 (data mapping) and does not exist yet.
 */
export const BKMV_DECLARED_VALUES = {
  /**
   * Fields 1005 / 1104 / 1154, "קבוע מערכת", `X(8)` and mandatory in all three.
   *
   * Eight characters, from the official instructions. Supplied by the architect
   * rather than extracted from the PDF; **if a future extraction disagrees with
   * this, stop and report rather than editing it.** The logical order below is
   * `& O F 1 . 3 1 &`; the alternative reading of the same eight characters is
   * "&1.31OF&", which is what a bidi round-trip through a Hebrew line produces.
   */
  systemConstant: "&OF1.31&",

  /** Field 1009, "מספר ע\"מ של יצרן התוכנה", `9(9)`. */
  vendorTaxId: "515960508",

  /** Field 1010, "שם יצרן התוכנה", `X(20)`. */
  vendorName: "Uxellent",

  /**
   * Field 1006, "מספר רישום התוכנה", `9(8)` and mandatory.
   *
   * The registration certificate has not been issued yet, and it cannot be:
   * the file is required in order to register, and the number is required in the
   * file. All zeros is a **documented placeholder**, and an export that carries
   * it must be marked as a sample rather than filed.
   */
  registrationNumberPlaceholder: "00000000",

  /** Field 1013, "סוג הנהח\"ש של התוכנה": 0 = not applicable. No bookkeeping module exists. */
  bookkeepingKind: "0",

  /**
   * Field 1012, "נתיב מיקום שמירת הקבצים", `X(50)` and mandatory.
   *
   * The published directory layout is
   * `<drive>:\OPENFRMT\<8-digit dealer number>.<YY>\<MMDDhhmm>\`, holding INI.TXT,
   * BKMVDATA.TXT and BKMVDATA compressed separately. There is no drive letter in
   * a cloud application, so this records the path from OPENFRMT down.
   * **A documented assumption, to be put to the registrar.**
   */
  filePathTemplate: "OPENFRMT\\<8-digit>.<YY>\\<MMDDhhmm>",
} as const;

/**
 * The characters written into the sign column of a signed amount field.
 *
 * **Open decision.** The spec's sign rules live in sections י"א and י"ב, which
 * have not been read into this repository; the widths are settled, the glyphs are
 * not. Changing these two characters is the whole change — no other code encodes
 * a sign.
 */
export const BKMV_AMOUNT_SIGN = {
  negative: "-",
  positive: " ",
} as const;

export const BKMV_SPEC: BkmvSpec = {
  version: BKMV_SPEC_VERSION,
  records: BKMV_RECORDS,
};

/**
 * Refuses to let the exporter run unless every in-scope record is fully
 * described.
 *
 * "Fully described" means the field widths add up to the record length the spec
 * publishes — summed from the widths, never derived from the printed `from`/`to`
 * columns, because the thirteen cancelled `X(0)` fields carry a notational
 * `from == to` while occupying no columns.
 *
 * The three out-of-scope records (B100, B110, M100) are reported by
 * `bkmvRecordLengthReport()` but never block: this system has no bookkeeping
 * module and no inventory, so it does not emit them.
 */
export function assertBkmvSpecComplete(): void {
  const rows = bkmvRecordLengthReport();
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const problems: Array<Record<string, unknown>> = [];

  for (const key of BKMV_IN_SCOPE_KEYS) {
    const record = BKMV_SPEC.records[key];
    const row = byKey.get(key);

    if (!record || !row) {
      problems.push({ record: key, reason: "missing" });
      continue;
    }
    if (!record.inScope) {
      problems.push({ record: key, reason: "declared out of scope" });
      continue;
    }
    if (record.fields.length === 0) {
      problems.push({ record: key, reason: "no fields" });
      continue;
    }
    if (!row.ok) {
      problems.push({
        record: key,
        reason: "field widths do not add up to the record length",
        computed: row.computed,
        declared: row.declared,
        fieldCount: row.fieldCount,
      });
    }
  }

  if (problems.length > 0) {
    throw new BkmvError(
      "BKMV_SPEC_INCOMPLETE",
      "BKMV spec is incomplete. The field tables in docs/regulatory/bkmv/fields-1.31.json do not fully describe every in-scope record.",
      { specVersion: BKMV_SPEC.version, problems }
    );
  }
}

export { BKMV_IN_SCOPE_KEYS, BKMV_RECORD_KEYS, BKMV_RECORDS, bkmvRecordLengthReport } from "./fields";
export type { BkmvRecordLengthRow } from "./fields";
