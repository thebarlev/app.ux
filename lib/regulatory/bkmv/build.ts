import "server-only";

import { encodeIso88598i } from "./encoding";
import { buildFixedLengthRecord } from "./format";
import { BkmvError } from "./errors";
import {
  bkmvA100Values,
  bkmvC100Values,
  bkmvD110Values,
  bkmvD120Values,
  bkmvZ900Values,
  classifyLine,
} from "./map";
import type { BkmvTruncation } from "./map";
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

export type BkmvBuildResult = {
  txtBuffer: Buffer;
  stats: {
    totalDocs: number;
    /** Documents that carry no payment line, and therefore no D120. */
    docsWithoutPaymentLines: number;
  };
  /**
   * Every value that had to be cut to fit its field, with the original. Approved
   * data loss is still data loss, so it is reported rather than absorbed.
   */
  truncations: BkmvTruncation[];
  /** How many records of each type were written — INI.TXT's summary lines. */
  recordCounts: Partial<Record<BkmvRecordCode, number>>;
  /** Total records in the file, for A000 field 1002 and Z900 field 1155. */
  recordCount: number;
};

export function buildBkmvTxt(params: {
  ctx: BkmvContext;
  documents: BkmvDocument[];
  lineItems: BkmvLineItem[];
  /** The fifteen-digit identifier shared with A000's 1004 and Z900's 1153. */
  primaryIdentifier: string;
}): BkmvBuildResult {
  // Refuse to generate until the fixed-length spec is fully populated.
  assertBkmvSpecComplete();

  const { ctx, documents, primaryIdentifier } = params;

  // Sort chronologically (issue_date, then created_at)
  const docsSorted = [...documents].sort((a, b) => {
    const aKey = `${a.issueDate || "9999-12-31"}|${a.createdAt}`;
    const bKey = `${b.issueDate || "9999-12-31"}|${b.createdAt}`;
    return aKey.localeCompare(bKey);
  });

  const linesByDoc = new Map<string, BkmvLineItem[]>();
  for (const line of params.lineItems) {
    const list = linesByDoc.get(line.documentId);
    if (list) list.push(line);
    else linesByDoc.set(line.documentId, [line]);
  }

  const records: RecordInput[] = [];
  const truncations: BkmvTruncation[] = [];

  /*
   * Which records are emitted, and which are not.
   *
   * BKMVDATA.TXT carries A100 → (C100, then D110 per goods line and D120 per
   * payment line, per document) → Z900. Section 2.4.י requires the second field of
   * every record to be a running record number across the file, so records are
   * numbered as they are pushed.
   *
   * B100, B110 and M100 are NOT emitted. This system has no bookkeeping module and
   * no inventory, so there are no journal entries, no ledger accounts and no stock
   * items; INI.TXT declares nothing for them at all.
   *
   * A000 and the INI summary lines belong to INI.TXT, which `ini.ts` produces.
   */

  const next = () => records.length + 1;

  records.push({
    key: "A100",
    code: "A100",
    values: bkmvA100Values({ ctx, recordNumber: next(), primaryIdentifier }),
  });

  let docsWithoutPaymentLines = 0;

  docsSorted.forEach((doc, docIndex) => {
    const lines = (linesByDoc.get(doc.id) ?? []).slice().sort((a, b) => a.lineNumber - b.lineNumber);
    const goods = lines.filter((l) => classifyLine(l, doc) === "goods");
    const payments = lines.filter((l) => classifyLine(l, doc) === "payment");

    // One link number per document, carried into 1234 / 1273 / 1323 so an auditor
    // can tie the lines back to their header (clarification 11).
    const linkNumber = docIndex + 1;

    records.push({
      key: "C100",
      code: "C100",
      values: bkmvC100Values({ ctx, document: doc, recordNumber: next(), linkNumber }),
    });

    for (const line of goods) {
      records.push({
        key: "D110",
        code: "D110",
        values: bkmvD110Values({ ctx, document: doc, line, recordNumber: next(), linkNumber, truncations }),
      });
    }

    /*
     * D120 is emitted per payment line, for ANY document that has them — not only
     * for a receipt. The instructions never restrict it to document type 400, and
     * D120 carries its own mandatory "סוג מסמך" field (1303) drawn from the full
     * appendix-1 table, which would be pointless if the record only ever belonged
     * to one type. A 320 that records how it was paid gets its payment lines.
     *
     * A document with no payment line gets no D120 rather than an invented one.
     * That is not a rare case: 50 of 107 issued 320s have no payment line in the
     * database, because the manual issuance path drops them.
     */
    if (payments.length === 0) docsWithoutPaymentLines++;

    for (const line of payments) {
      records.push({
        key: "D120",
        code: "D120",
        values: bkmvD120Values({ ctx, document: doc, line, recordNumber: next(), linkNumber }),
      });
    }
  });

  // Z900 counts itself, so its record number and the total are the same.
  const closingNumber = next();
  records.push({
    key: "Z900",
    code: "Z900",
    values: bkmvZ900Values({
      ctx,
      recordNumber: closingNumber,
      primaryIdentifier,
      totalRecords: closingNumber,
    }),
  });

  // Fixed-length lines + CRLF. Section 2.4.ט(2): the two characters are not part
  // of the record length in the tables.
  const txt = records.map(buildRecordLine).join("\r\n") + "\r\n";
  const txtBuffer = encodeIso88598i(txt);

  const recordCounts: Partial<Record<BkmvRecordCode, number>> = {};
  for (const record of records) {
    recordCounts[record.code] = (recordCounts[record.code] ?? 0) + 1;
  }

  return {
    txtBuffer,
    stats: { totalDocs: docsSorted.length, docsWithoutPaymentLines },
    truncations,
    recordCounts,
    recordCount: records.length,
  };
}
