/**
 * Imports the BKMV 1.31 field tables from the published JSON and turns them into
 * the executable spec.
 *
 * **Nothing here is hand-typed.** Every width, position, description and
 * requirement comes from `docs/regulatory/bkmv/fields-1.31.json`. Editing a
 * width by hand in this file is a bug; edit the JSON, which is the single source
 * of truth, and let the checks below reject it if it is inconsistent.
 *
 * The notation is parsed from the `tech` column (`X(20)`, `9(9)`, `X9(12)v99`)
 * and **not** from the `type` column. `type` is prose and is spelled three
 * different ways for "alphanumeric" in the source document, one of them with a
 * space inside the word. `tech` is machine-readable and agrees with `type` in all
 * 207 fields.
 */

import rawFields from "@/docs/regulatory/bkmv/fields-1.31.json";
import { BkmvError } from "./errors";
import type { BkmvFieldSpec, BkmvRecordKey, BkmvRecordSpec, BkmvRequirement } from "./types";

type RawField = {
  no: number;
  desc: string;
  type: string;
  tech: string;
  from: number;
  to: number;
  len: number;
  req: string;
};

type RawRecord = {
  name: string;
  record_length: number;
  in_scope: boolean;
  fields: RawField[];
};

/** Emission order, and the authoritative list of record types. */
export const BKMV_RECORD_KEYS = [
  "A000",
  "INI-SUM",
  "A100",
  "Z900",
  "C100",
  "D110",
  "D120",
  "B100",
  "B110",
  "M100",
] as const satisfies readonly BkmvRecordKey[];

/** The seven records this system produces. B100, B110 and M100 are excluded by the scope decision of 9.8.2026. */
export const BKMV_IN_SCOPE_KEYS = [
  "A000",
  "INI-SUM",
  "A100",
  "Z900",
  "C100",
  "D110",
  "D120",
] as const satisfies readonly BkmvRecordKey[];

const RAW = rawFields as unknown as Record<BkmvRecordKey, RawRecord>;

/** `X(n)` — plain alphanumeric. Tolerates the stray space in the source's `X(3 )`. */
const ALPHANUMERIC = /^X\(\s*(\d+)\s*\)$/;

/** `9(n)`, `9(n)v9…` and `X9(n)v9…` — a plain integer, or a fixed-point amount with an optional sign column. */
const NUMERIC_OR_AMOUNT = /^(X?)9\(\s*(\d+)\s*\)(?:v(9+))?$/;

function fail(message: string, details: Record<string, unknown>): never {
  throw new BkmvError("BKMV_SPEC_INCOMPLETE", message, details);
}

function parseRequirement(req: string, where: Record<string, unknown>): BkmvRequirement {
  switch (req.replace(/\s+/g, "")) {
    case "ח":
      return "mandatory";
    case "ח/ר":
      return "optional";
    case "חמ":
      return "conditional";
    default:
      return fail("Unrecognised BKMV requirement marker", { ...where, req });
  }
}

function parseField(raw: RawField, recordKey: BkmvRecordKey): BkmvFieldSpec {
  const where = { record: recordKey, field: raw.no, tech: raw.tech };
  const requirement = parseRequirement(raw.req, where);
  const base = {
    no: raw.no,
    desc: raw.desc,
    tech: raw.tech,
    from: raw.from,
    to: raw.to,
    requirement,
  };

  const alpha = ALPHANUMERIC.exec(raw.tech);
  if (alpha) {
    return { ...base, kind: "alphanumeric", width: Number(alpha[1]) };
  }

  const num = NUMERIC_OR_AMOUNT.exec(raw.tech);
  if (num) {
    const signed = num[1] === "X";
    const intDigits = Number(num[2]);
    const decimals = num[3];

    if (!decimals) {
      if (signed) {
        // A sign column with no implied decimals is not a shape the spec uses.
        return fail("Signed integer notation is not supported by the BKMV spec", where);
      }
      return { ...base, kind: "numeric", width: intDigits, digits: intDigits };
    }

    const decDigits = decimals.length;
    return {
      ...base,
      kind: "amount",
      width: (signed ? 1 : 0) + intDigits + decDigits,
      signed,
      intDigits,
      decDigits,
    };
  }

  return fail("Unparsable BKMV field notation", where);
}

function buildRecord(key: BkmvRecordKey): BkmvRecordSpec {
  const raw = RAW[key];
  if (!raw || !Array.isArray(raw.fields) || raw.fields.length === 0) {
    return fail("BKMV record is missing from the field tables", { record: key });
  }

  const fields = raw.fields.map((f) => parseField(f, key));

  // The notation must agree with the width the source document prints for the
  // same field. Two independent columns; a disagreement means the JSON is wrong.
  raw.fields.forEach((f, i) => {
    const parsed = fields[i];
    if (parsed.width !== f.len) {
      fail("BKMV field width disagrees with its notation", {
        record: key,
        field: f.no,
        tech: f.tech,
        declaredLength: f.len,
        parsedWidth: parsed.width,
      });
    }
  });

  const codeField = fields[0];
  if (codeField.kind !== "alphanumeric" || codeField.width !== 4) {
    fail("The first field of a BKMV record must be the four-character record code", {
      record: key,
      field: codeField.no,
      tech: codeField.tech,
    });
  }

  return {
    key,
    name: raw.name,
    recordLength: raw.record_length,
    inScope: raw.in_scope === true,
    codeFieldNo: codeField.no,
    fields,
  };
}

export const BKMV_RECORDS: Partial<Record<BkmvRecordKey, BkmvRecordSpec>> = Object.fromEntries(
  BKMV_RECORD_KEYS.map((key) => [key, buildRecord(key)])
);

/** One row per record type: what the field widths add up to against what the record is published to be. */
export type BkmvRecordLengthRow = {
  key: BkmvRecordKey;
  inScope: boolean;
  fieldCount: number;
  /** The sum of the field widths. Summed, never derived from `from`/`to`. */
  computed: number;
  /** The record length as published. */
  declared: number;
  ok: boolean;
};

export function bkmvRecordLengthReport(): BkmvRecordLengthRow[] {
  return BKMV_RECORD_KEYS.map((key) => {
    const record = BKMV_RECORDS[key];
    if (!record) {
      return { key, inScope: false, fieldCount: 0, computed: 0, declared: 0, ok: false };
    }
    const computed = record.fields.reduce((sum, f) => sum + f.width, 0);
    return {
      key,
      inScope: record.inScope,
      fieldCount: record.fields.length,
      computed,
      declared: record.recordLength,
      ok: computed === record.recordLength,
    };
  });
}
