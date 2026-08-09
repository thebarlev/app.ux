import "server-only";

import { encodeIso88598i } from "./encoding";
import { buildFixedLengthRecord } from "./format";
import { BkmvError } from "./errors";
import { assertBkmvSpecComplete, BKMV_SPEC } from "./spec";
import type { BkmvContext, BkmvDocument, BkmvLineItem, BkmvRecordCode, BkmvRecordKey } from "./types";

type RecordInput = {
  /** Which field table to use. */
  key: BkmvRecordKey;
  /** The four characters written into the record's code field. Differs from `key` only for INI-SUM. */
  code: BkmvRecordCode;
  /**
   * Values by **field number** — 1103, 1203, … — because the spec's field numbers
   * are its own identifiers and the published tables carry no English names.
   */
  values: Record<number, unknown>;
};

function buildRecordLine(input: RecordInput): string {
  const spec = BKMV_SPEC.records[input.key];
  if (!spec) {
    throw new BkmvError("BKMV_INTERNAL", "Unknown record code", { code: input.key });
  }

  const pairs = spec.fields.map((field) => ({
    spec: field,
    value: field.no === spec.codeFieldNo ? input.code : input.values[field.no],
  }));

  return buildFixedLengthRecord(pairs);
}

export function buildBkmvTxt(params: {
  ctx: BkmvContext;
  documents: BkmvDocument[];
  lineItems: BkmvLineItem[];
}): {
  txtBuffer: Buffer;
  stats: { totalDocs: number };
  /**
   * How many records of each type were written, which INI.TXT needs for its
   * summary lines. Counted from what was actually emitted, not predicted.
   */
  recordCounts: Partial<Record<BkmvRecordCode, number>>;
  /** Total records in the file, for A000 field 1002. */
  recordCount: number;
} {
  // Refuse to generate until the fixed-length spec is fully populated.
  assertBkmvSpecComplete();

  const { documents } = params;

  // Sort chronologically (issue_date, then created_at)
  const docsSorted = [...documents].sort((a, b) => {
    const aKey = `${a.issueDate || "9999-12-31"}|${a.createdAt}`;
    const bKey = `${b.issueDate || "9999-12-31"}|${b.createdAt}`;
    return aKey.localeCompare(bKey);
  });

  const records: RecordInput[] = [];

  /*
   * Which records are emitted, and which are not.
   *
   * BKMVDATA.TXT carries A100 → (C100, D110, D120 per document) → Z900.
   *
   * B100, B110 and M100 are NOT emitted. This system has no bookkeeping module
   * and no inventory, so there are no journal entries, no ledger accounts and no
   * stock items; INI.TXT declares 0 for each of them. An earlier revision wrote
   * B100 and B110 as empty 317- and 376-character lines, which asserts that an
   * empty journal entry exists — worse than their absence.
   *
   * A000 and the INI summary lines belong to INI.TXT, which this function does
   * not produce; that is workplan stage 2.
   *
   * NOTE: the per-field values below are deliberately empty. Mapping each field
   * number to a database column is workplan stage 5 and has not been reviewed.
   * Until it is, every record fails its own mandatory-field validation and no
   * file is produced — the same closed door as before, one layer further in.
   */

  records.push({ key: "A100", code: "A100", values: {} });

  for (const doc of docsSorted) {
    records.push({ key: "C100", code: "C100", values: {} });
    records.push({ key: "D110", code: "D110", values: {} });

    if (doc.documentType === "receipt") {
      records.push({ key: "D120", code: "D120", values: {} });
    }
  }

  records.push({ key: "Z900", code: "Z900", values: {} });

  // Fixed-length lines + CRLF
  const txt = records.map(buildRecordLine).join("\r\n") + "\r\n";
  const txtBuffer = encodeIso88598i(txt);

  const recordCounts: Partial<Record<BkmvRecordCode, number>> = {};
  for (const record of records) {
    recordCounts[record.code] = (recordCounts[record.code] ?? 0) + 1;
  }

  return {
    txtBuffer,
    stats: { totalDocs: docsSorted.length },
    recordCounts,
    recordCount: records.length,
  };
}
