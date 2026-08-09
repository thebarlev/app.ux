import { expect, test } from "@playwright/test";

import {
  BKMV_A000_UNRESOLVED,
  BKMV_SUMMARISED_RECORD_CODES,
  bkmvExportDirectory,
  bkmvSummaryRecords,
  buildIniTxt,
  type BkmvIniInput,
} from "@/lib/regulatory/bkmv/ini";
import { BKMV_RECORDS, bkmvRecordLengthReport } from "@/lib/regulatory/bkmv/fields";

/**
 * A regulatory file is measured, not compiled and hoped for. Every number here is
 * read off a rendered record.
 */

function input(overrides: Partial<BkmvIniInput> = {}): BkmvIniInput {
  return {
    primaryIdentifier: "123456789012345",
    dealerNumber: "515960508",
    businessName: 'אוקסלנט בע"מ',
    address: { street: "הרצל", houseNumber: null, city: "תל אביב", postalCode: "6120101" },
    bkmvDataRecordCount: 1234,
    summaries: [
      { code: "C100", count: 12 },
      { code: "D110", count: 34 },
      { code: "D120", count: 5 },
    ],
    range: { from: "2026-01-01", to: "2026-12-31" },
    processStartedAt: new Date(2026, 7, 9, 16, 42),
    filePath: "OPENFRMT\\51596050.26\\08091642",
    ...overrides,
  };
}

test("A000 is exactly 466 characters and every summary line exactly 19", () => {
  const { lines } = buildIniTxt(input());

  expect(lines).toHaveLength(4);
  expect(lines[0]).toHaveLength(466);
  for (const line of lines.slice(1)) {
    expect(line).toHaveLength(19);
  }
});

test("the file is 466 + 19 per summary + CRLF per line", () => {
  const { txtBuffer, lines } = buildIniTxt(input());
  expect(txtBuffer.length).toBe(466 + 3 * 19 + lines.length * 2);
});

test("declared values land on the columns the spec gives them", () => {
  const a000 = buildIniTxt(input()).lines[0];

  expect(a000.slice(0, 4)).toBe("A000"); // 1000, cols 1-4
  expect(a000.slice(9, 24)).toBe("000000000001234"); // 1002, cols 10-24
  expect(a000.slice(24, 33)).toBe("515960508"); // 1003, cols 25-33
  expect(a000.slice(33, 48)).toBe("123456789012345"); // 1004, cols 34-48
  expect(a000.slice(48, 56)).toBe("&OF1.31&"); // 1005, cols 49-56
  expect(a000.slice(56, 64)).toBe("00000000"); // 1006, cols 57-64
  expect(a000.slice(64, 84)).toBe("UXellent".padEnd(20, " ")); // 1007, cols 65-84
  expect(a000.slice(84, 104)).toBe("1.0".padEnd(20, " ")); // 1008, cols 85-104
  expect(a000.slice(104, 113)).toBe("515960508"); // 1009, cols 105-113
  expect(a000.slice(113, 133)).toBe("Uxellent".padEnd(20, " ")); // 1010, cols 114-133
  expect(a000.slice(133, 134)).toBe("2"); // 1011, col 134
  expect(a000.slice(184, 185)).toBe("0"); // 1013, col 185
  expect(a000.slice(394, 395)).toBe("0"); // 1028, col 395
  expect(a000.slice(395, 396)).toBe("1"); // 1029, col 396
  expect(a000.slice(396, 416)).toBe("JSZip".padEnd(20, " ")); // 1030, cols 397-416
  expect(a000.slice(416, 419)).toBe("ILS"); // 1032, cols 417-419
  expect(a000.slice(419, 420)).toBe("0"); // 1034, col 420
});

test("the date fields are YYYYMMDD and the time field is hhmm", () => {
  const a000 = buildIniTxt(input()).lines[0];

  expect(a000.slice(362, 366)).toBe("2026"); // 1023 שנת המס, cols 363-366
  expect(a000.slice(366, 374)).toBe("20260101"); // 1024, cols 367-374
  // 1025 is capped at the export day — see the dedicated test below. The fixture
  // exports on 2026-08-09, so a 2026-12-31 request lands on 20260809.
  expect(a000.slice(374, 382)).toBe("20260809"); // 1025, cols 375-382
  expect(a000.slice(382, 390)).toBe("20260809"); // 1026, cols 383-390
  expect(a000.slice(390, 394)).toBe("1642"); // 1027, cols 391-394
});

test("the reserved areas 1001, 1017 and 1035 are blank", () => {
  const a000 = buildIniTxt(input()).lines[0];

  expect(a000.slice(4, 9)).toBe(" ".repeat(5)); // 1001
  expect(a000.slice(204, 214)).toBe(" ".repeat(10)); // 1017
  expect(a000.slice(420, 466)).toBe(" ".repeat(46)); // 1035
});

test("a summary line carries the summarised code in 1050 and the count in 1051", () => {
  const lines = buildIniTxt(input()).lines;

  expect(lines[1]).toBe("C100" + "12".padStart(15, "0"));
  expect(lines[2]).toBe("D110" + "34".padStart(15, "0"));
  expect(lines[3]).toBe("D120" + "5".padStart(15, "0"));
});

test("only the data records are summarised, and a type that was not produced gets no line", () => {
  expect([...BKMV_SUMMARISED_RECORD_CODES]).toEqual(["C100", "D110", "D120"]);

  // A100 and Z900 are the envelope; B100, B110 and M100 are never produced.
  expect(bkmvSummaryRecords({ C100: 3, D110: 9, A100: 1, Z900: 1, B100: 0 })).toEqual([
    { code: "C100", count: 3 },
    { code: "D110", count: 9 },
  ]);

  // No D120 in the range means no D120 line, not a line declaring zero.
  expect(bkmvSummaryRecords({ C100: 1, D120: 0 })).toEqual([{ code: "C100", count: 1 }]);
});

test("all-zeros in 1006 marks the file as a sample", () => {
  expect(buildIniTxt(input()).isSample).toBe(true);
});

test("the export directory uses the first eight digits, dropping the check digit", () => {
  const at = new Date(2026, 7, 9, 16, 42);

  expect(bkmvExportDirectory({ dealerNumber: "515960508", at })).toBe("OPENFRMT\\51596050.26\\08091642");
  expect(bkmvExportDirectory({ dealerNumber: "00223344", at })).toBe("OPENFRMT\\00223344.26\\08091642");
  expect(() => bkmvExportDirectory({ dealerNumber: "1234567", at })).toThrow(/at least 8 digits/);
});

test("a range spanning two tax years is refused rather than truncated", () => {
  expect(() => buildIniTxt(input({ range: { from: "2025-06-01", to: "2026-05-31" } }))).toThrow(
    /single tax year/
  );
});

test("no mandatory A000 field is left without a value", () => {
  expect(BKMV_A000_UNRESOLVED).toEqual([]);
});

test("every in-scope record's field widths add up to its published length", () => {
  const known: Record<string, number> = {
    A000: 466,
    "INI-SUM": 19,
    A100: 95,
    Z900: 110,
    C100: 444,
    D110: 339,
    D120: 222,
  };

  for (const row of bkmvRecordLengthReport()) {
    const record = BKMV_RECORDS[row.key];
    expect(record, `${row.key} is missing from the field tables`).toBeTruthy();
    expect(row.computed, `${row.key} widths do not add up`).toBe(row.declared);
    if (row.key in known) {
      expect(row.declared, `${row.key} is not the published length`).toBe(known[row.key]);
    }
  }
});

test("1025 is capped at the day the export runs, because a data range cannot end in the future", () => {
  // A full tax year requested, exported in August.
  const a000 = buildIniTxt(
    input({
      range: { from: "2026-01-01", to: "2026-12-31" },
      processStartedAt: new Date(2026, 7, 9, 16, 42),
    })
  ).lines[0];

  expect(a000.slice(366, 374)).toBe("20260101"); // 1024, the range start, untouched
  expect(a000.slice(374, 382)).toBe("20260809"); // 1025, capped at today
  expect(a000.slice(362, 366)).toBe("2026"); // 1023 still the tax year
});

test("1025 keeps the requested end when the range is already in the past", () => {
  const a000 = buildIniTxt(
    input({
      range: { from: "2025-01-01", to: "2025-12-31" },
      processStartedAt: new Date(2026, 7, 9, 16, 42),
    })
  ).lines[0];

  expect(a000.slice(374, 382)).toBe("20251231");
});
