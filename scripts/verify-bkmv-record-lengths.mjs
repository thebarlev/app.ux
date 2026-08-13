#!/usr/bin/env node
/**
 * Acceptance check for the BKMV 1.31 field tables.
 *
 * For every record type it sums the field widths and compares that sum against
 * two independent numbers: the record length published inside
 * docs/regulatory/bkmv/fields-1.31.json, and the record length known from the
 * instructions themselves, hard-coded below.
 *
 * Two rules this check exists to enforce:
 *
 *   1. It SUMS the `len` column. It never derives a width from `from`/`to`.
 *      Thirteen fields are cancelled `X(0)` fields that carry a notational
 *      `from == to` while occupying no columns; any check that walks positions
 *      reports false mismatches on six of the ten records.
 *
 *   2. The seven in-scope records are a blocking gate — a gap in any of them
 *      exits non-zero. B100, B110 and M100 are out of scope (no bookkeeping
 *      module, no inventory; scope decision of 9.8.2026) and are reported only.
 *
 * Run: node scripts/verify-bkmv-record-lengths.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELDS_PATH = join(HERE, "..", "docs", "regulatory", "bkmv", "fields-1.31.json");

/**
 * Record lengths as published in "הוראות להפקת קבצים במבנה אחיד", version 1.31.
 * `gate: true` means a mismatch fails the check.
 */
const KNOWN = [
  { key: "A000", known: 466, gate: true },
  { key: "INI-SUM", known: 19, gate: true },
  { key: "A100", known: 95, gate: true },
  { key: "Z900", known: 110, gate: true },
  { key: "C100", known: 444, gate: true },
  { key: "D110", known: 339, gate: true },
  { key: "D120", known: 222, gate: true },
  { key: "B100", known: 317, gate: false },
  { key: "B110", known: 376, gate: false },
  { key: "M100", known: 298, gate: false },
];

const fields = JSON.parse(readFileSync(FIELDS_PATH, "utf8"));

const rows = KNOWN.map(({ key, known, gate }) => {
  const record = fields[key];
  if (!record || !Array.isArray(record.fields) || record.fields.length === 0) {
    return { key, known, gate, missing: true, fieldCount: 0, computed: 0, declared: 0, ok: false };
  }

  const computed = record.fields.reduce((sum, f) => sum + f.len, 0);
  const declared = record.record_length;

  return {
    key,
    known,
    gate,
    missing: false,
    fieldCount: record.fields.length,
    computed,
    declared,
    ok: computed === declared && declared === known,
  };
});

const pad = (v, w) => String(v).padStart(w);
const padEnd = (v, w) => String(v).padEnd(w);

console.log("BKMV 1.31 — record length check");
console.log(`source: docs/regulatory/bkmv/fields-1.31.json`);
console.log("");
console.log(`${padEnd("record", 9)} ${padEnd("scope", 6)} ${pad("fields", 6)} ${pad("computed", 9)} ${pad("declared", 9)} ${pad("known", 6)}  result`);

for (const row of rows) {
  const scope = row.gate ? "in" : "out";
  const verdict = row.missing
    ? "MISSING FROM THE FIELD TABLES"
    : row.ok
      ? "OK"
      : `MISMATCH (computed ${row.computed} / declared ${row.declared} / known ${row.known})`;

  console.log(
    `${padEnd(row.key, 9)} ${padEnd(scope, 6)} ${pad(row.fieldCount, 6)} ${pad(row.computed, 9)} ${pad(row.declared, 9)} ${pad(row.known, 6)}  ${verdict}`
  );
}

const inScope = rows.filter((r) => r.gate);
const failures = inScope.filter((r) => !r.ok);
const outOfScopeFailures = rows.filter((r) => !r.gate && !r.ok);
const inScopeFields = inScope.reduce((sum, r) => sum + r.fieldCount, 0);

console.log("");
console.log(`in scope: ${inScope.length - failures.length}/${inScope.length} records, ${inScopeFields} fields`);

if (outOfScopeFailures.length > 0) {
  console.log(`out of scope, reported only: ${outOfScopeFailures.map((r) => r.key).join(", ")} did not match`);
}

if (failures.length > 0) {
  console.error("");
  console.error(`FAILED: ${failures.map((r) => r.key).join(", ")}`);
  console.error("A record whose field widths do not add up to its published length produces a file that");
  console.error("shifts every column after the gap. Fix docs/regulatory/bkmv/fields-1.31.json.");
  process.exit(1);
}

console.log("PASSED");
