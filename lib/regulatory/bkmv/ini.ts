import "server-only";

import { randomInt } from "node:crypto";

import { encodeIso88598i } from "./encoding";
import { buildFixedLengthRecord, formatDateYYYYMMDD, formatTimeHHMM, localIsoDate } from "./format";
import { BkmvError } from "./errors";
import { BKMV_DECLARED_VALUES, BKMV_SPEC } from "./spec";
import type { BkmvRecordCode } from "./types";

/**
 * Builds INI.TXT — the file that describes the export and counts what is inside
 * BKMVDATA.TXT.
 *
 * It holds one A000 record of 466 characters, followed by one summary record of
 * 19 characters per record type, where field 1050 carries the code of the type
 * being summarised and 1051 its count.
 *
 * Summary lines cover the data records only — C100, D110, D120. A100 and Z900 are
 * the envelope and are not summarised, and a type that was not produced gets no
 * line at all rather than a line declaring zero. Build the list with
 * `bkmvSummaryRecords` from the counts BKMVDATA.TXT actually emitted.
 */

/**
 * A single space. Rendered into a field it becomes that field's full width in
 * spaces.
 *
 * Fields 1001, 1017 and 1035 are reserved areas — "לשימוש עתידי" and "שטח
 * לנתונים עתידיים" — marked mandatory with nothing to put in them. Blanks are
 * deliberate here and not an omission: the value is present, and it is empty.
 */
const RESERVED_AREA = " ";

/**
 * A000 fields that are mandatory and still have no value behind them.
 *
 * **Empty, and it must stay empty.** Every mandatory field now carries either a
 * value from the database or a value declared in `BKMV_DECLARED_VALUES`. Anything
 * added back to this list is a field that would ship blank, which is a rejected
 * file — the test suite asserts the list is empty for exactly that reason.
 */
export const BKMV_A000_UNRESOLVED: ReadonlyArray<{
  no: number;
  tech: string;
  name: string;
  missing: string;
}> = [];

/**
 * The record types that get a summary line in INI.TXT: the data records only.
 *
 * A100 and Z900 are the envelope and are not summarised. B100, B110 and M100 are
 * data records but this system never produces them, so they never appear either —
 * and a type that was not produced gets no line at all, not a line declaring
 * zero. `docs/BKMV_workplan.md:86`, which said INI.TXT should declare 0 for each
 * of the three, is obsolete and overruled.
 */
export const BKMV_SUMMARISED_RECORD_CODES = ["C100", "D110", "D120"] as const;

/**
 * Turns the counts taken from BKMVDATA.TXT into the summary lines INI.TXT should
 * carry, in record order, skipping any type that was not produced.
 */
export function bkmvSummaryRecords(
  counts: Partial<Record<BkmvRecordCode, number>>
): Array<{ code: BkmvRecordCode; count: number }> {
  return BKMV_SUMMARISED_RECORD_CODES.filter((code) => (counts[code] ?? 0) > 0).map((code) => ({
    code: code as BkmvRecordCode,
    count: counts[code] as number,
  }));
}

export type BkmvIniInput = {
  /**
   * The fifteen-digit identifier. **The same value must appear in A000 field
   * 1004, A100 field 1103 and Z900 field 1153** — it is the first thing an audit
   * looks at. Generated once per export and passed to all three from here.
   */
  primaryIdentifier: string;

  /** 1003 — the dealer number (`companies.tax_id`). */
  dealerNumber: string;

  /** 1018 — the business name (`companies.company_name`). */
  businessName: string;

  /** 1019-1022, all optional in the spec. */
  address?: {
    street?: string | null;
    /**
     * 1020, optional.
     *
     * **Documented assumption:** `companies` has no house-number column, so this
     * is left absent and writes blanks; the number is presumably inside `street`.
     */
    houseNumber?: string | null;
    city?: string | null;
    postalCode?: string | null;
  };

  /**
   * 1015, optional.
   *
   * **Documented assumption:** left absent for now, which writes zeros. Two
   * columns are candidates — `companies.registration_number` and
   * `companies.company_number` — and which of them is the Registrar of Companies
   * number has not been established.
   */
  registrarCompanyNumber?: string | null;

  /**
   * 1016, optional.
   *
   * **Documented assumption:** no column holds a withholding file number, so this
   * is left absent and writes zeros.
   */
  withholdingFileNumber?: string | null;

  /** 1002 — the number of records written to BKMVDATA.TXT. */
  bkmvDataRecordCount: number;

  /**
   * One summary record per entry, in order. Field 1050 takes `code`, 1051 takes
   * `count`. Build it with `bkmvSummaryRecords`, which applies the policy: data
   * records only, and nothing for a type that was not produced.
   */
  summaries: Array<{ code: BkmvRecordCode; count: number }>;

  /** The data range. 1024 and 1025, and the tax year in 1023. */
  range: { from: string; to: string };

  /** 1026 and 1027 — the date and the HHMM of the moment the export began. */
  processStartedAt: Date;

  /**
   * 1012 — the path the files are written to, without a drive letter. Build it
   * with `bkmvExportDirectory` rather than by hand.
   */
  filePath: string;
};

/**
 * A fresh fifteen-digit primary identifier for one export.
 *
 * The instructions call for a random fifteen-digit number that appears
 * **identically** in A000 field 1004, A100 field 1103 and Z900 field 1153. It is
 * generated once, here, so that the three cannot drift apart — that mismatch is
 * the first thing an audit looks for.
 */
export function bkmvPrimaryIdentifier(): string {
  let digits = "";
  while (digits.length < 15) {
    digits += String(randomInt(0, 1_000_000_000)).padStart(9, "0");
  }
  return digits.slice(0, 15);
}

function requireSpec(key: "A000" | "INI-SUM") {
  const spec = BKMV_SPEC.records[key];
  if (!spec) {
    throw new BkmvError("BKMV_INTERNAL", "Record is missing from the field tables", { record: key });
  }
  return spec;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The directory the export belongs in: `OPENFRMT\<8 digits>.<YY>\<MMDDhhmm>`.
 *
 * No drive letter — there is none in a cloud application, and the assumption
 * that the path starts at OPENFRMT is documented and still to be put to the
 * registrar.
 *
 * The published example is `00223344.08`, eight digits, while an Israeli dealer
 * number is nine. The eight are **the first eight** — the number without its
 * check digit. 515960508 becomes 51596050.
 */
export function bkmvExportDirectory(params: { dealerNumber: string; at: Date }): string {
  const all = params.dealerNumber.replace(/\D/g, "");
  if (all.length < 8) {
    throw new BkmvError(
      "BKMV_FORMAT_VALIDATION",
      "The export directory needs at least 8 digits of the dealer number",
      { dealerNumber: params.dealerNumber, digits: all.length }
    );
  }
  // The first eight: the dealer number without its trailing check digit.
  const digits = all.slice(0, 8);

  const yy = two(params.at.getFullYear() % 100);
  const stamp = `${two(params.at.getMonth() + 1)}${two(params.at.getDate())}${two(params.at.getHours())}${two(params.at.getMinutes())}`;
  return `OPENFRMT\\${digits}.${yy}\\${stamp}`;
}

/** The earlier of two `YYYY-MM-DD` dates. String order is date order in that format. */
function earlierOf(a: string, b: string): string {
  return a <= b ? a : b;
}

function taxYear(range: { from: string; to: string }): string {
  const fromYear = range.from.slice(0, 4);
  const toYear = range.to.slice(0, 4);
  if (fromYear !== toYear) {
    throw new BkmvError(
      "BKMV_FORMAT_VALIDATION",
      "Field 1023 holds a single tax year, and this range spans two. Export one tax year at a time.",
      { from: range.from, to: range.to }
    );
  }
  return fromYear;
}

function buildA000Line(input: BkmvIniInput): string {
  const spec = requireSpec("A000");

  const values: Record<number, unknown> = {
    1001: RESERVED_AREA,
    1002: input.bkmvDataRecordCount,
    1003: input.dealerNumber,
    1004: input.primaryIdentifier,
    1005: BKMV_DECLARED_VALUES.systemConstant,
    1006: BKMV_DECLARED_VALUES.registrationNumberPlaceholder,
    1007: BKMV_DECLARED_VALUES.softwareName,
    1008: BKMV_DECLARED_VALUES.softwareRelease,
    1009: BKMV_DECLARED_VALUES.vendorTaxId,
    1010: BKMV_DECLARED_VALUES.vendorName,
    1011: BKMV_DECLARED_VALUES.softwareKind,
    1012: input.filePath,
    1013: BKMV_DECLARED_VALUES.bookkeepingKind,
    // 1014 איזון חשבונאי נדרש — optional, and only meaningful under double-entry
    // bookkeeping, which this system does not have.
    1015: input.registrarCompanyNumber ?? undefined,
    1016: input.withholdingFileNumber ?? undefined,
    1017: RESERVED_AREA,
    1018: input.businessName,
    1019: input.address?.street ?? undefined,
    1020: input.address?.houseNumber ?? undefined,
    1021: input.address?.city ?? undefined,
    1022: input.address?.postalCode ?? undefined,
    1023: taxYear(input.range),
    1024: formatDateYYYYMMDD(input.range.from),
    /*
     * 1025 סיום/חיתוך טווח נתונים.
     *
     * Capped at the day the export runs. The requested range is whatever the user
     * asked for — a full tax year, typically — but the end of the DATA range cannot
     * be in the future, and the simulator rejects it: "התאריך לא יכול להיות עתידי".
     * An export of 2026 run in August describes data up to August.
     */
    1025: formatDateYYYYMMDD(earlierOf(input.range.to, localIsoDate(input.processStartedAt))),
    1026: formatDateYYYYMMDD(localIsoDate(input.processStartedAt)),
    1027: formatTimeHHMM(input.processStartedAt),
    1028: BKMV_DECLARED_VALUES.languageCode,
    1029: BKMV_DECLARED_VALUES.characterSetCode,
    1030: BKMV_DECLARED_VALUES.compressionSoftwareName,
    // 1031 and 1033 are cancelled X(0) fields and consume no columns at all.
    1032: BKMV_DECLARED_VALUES.leadingCurrency,
    1034: BKMV_DECLARED_VALUES.branchInfo,
    1035: RESERVED_AREA,
  };

  return buildFixedLengthRecord(
    spec.fields.map((field) => ({
      spec: field,
      value: field.no === spec.codeFieldNo ? "A000" : values[field.no],
    }))
  );
}

function buildSummaryLine(entry: { code: BkmvRecordCode; count: number }): string {
  const spec = requireSpec("INI-SUM");
  return buildFixedLengthRecord(
    spec.fields.map((field) => ({
      spec: field,
      // 1050 carries the code of the type being summarised, 1051 its count.
      value: field.no === spec.codeFieldNo ? entry.code : entry.count,
    }))
  );
}

export type BkmvIniResult = {
  txtBuffer: Buffer;
  /** Each line without its CRLF, so a caller can assert the widths. */
  lines: string[];
  /**
   * True while field 1006 is the all-zeros placeholder, which it is until the
   * registration certificate is issued. **A file built with it is a sample and
   * must not be filed.**
   */
  isSample: boolean;
};

export function buildIniTxt(input: BkmvIniInput): BkmvIniResult {
  const lines = [buildA000Line(input), ...input.summaries.map(buildSummaryLine)];

  // Nothing downstream can recover from a short line, so measure here.
  const a000 = requireSpec("A000");
  const summary = requireSpec("INI-SUM");
  lines.forEach((line, i) => {
    const expected = i === 0 ? a000.recordLength : summary.recordLength;
    if (line.length !== expected) {
      throw new BkmvError("BKMV_FORMAT_VALIDATION", "INI.TXT line is not the length its record requires", {
        line: i + 1,
        record: i === 0 ? "A000" : input.summaries[i - 1]?.code,
        expected,
        actual: line.length,
      });
    }
  });

  return {
    txtBuffer: encodeIso88598i(lines.join("\r\n") + "\r\n"),
    lines,
    // Whatever 1006 actually holds: all zeros means no registration number has
    // been issued, and the file is a sample.
    isSample: /^0+$/.test(BKMV_DECLARED_VALUES.registrationNumberPlaceholder),
  };
}
