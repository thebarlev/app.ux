import { expect, test } from "@playwright/test";

import {
  BKMV_APPENDIX_4_RECORD_TABLE,
  bkmvAppendix4RecordRows,
  bkmvProducedAtStamp,
  bkmvRangeDDMMYYYY,
} from "@/lib/regulatory/bkmv/appendix4";
import { bkmvExportDirectory } from "@/lib/regulatory/bkmv/ini";
import { BKMV_SUMMARISED_RECORD_CODES } from "@/lib/regulatory/bkmv/ini";

/**
 * Appendix 4, page 20. Every expectation here is a line of that page.
 */

test("the table is the eight record types, in the spec's printed order", () => {
  expect(BKMV_APPENDIX_4_RECORD_TABLE.map((r) => r.code)).toEqual([
    "A100",
    "B100",
    "B110",
    "C100",
    "D110",
    "D120",
    "M100",
    "Z900",
  ]);
});

test("the descriptions are the spec's words, not ours", () => {
  const byCode = new Map(BKMV_APPENDIX_4_RECORD_TABLE.map((r) => [r.code, r.description]));
  expect(byCode.get("A100")).toBe("רשומה פתיחה");
  expect(byCode.get("B100")).toBe("תנועות בהנהלת חשבונות");
  expect(byCode.get("B110")).toBe("חשבון בהנהלת חשבונות");
  expect(byCode.get("C100")).toBe("כותרת מסמך");
  expect(byCode.get("D110")).toBe("פרטי מסמך");
  // "פרטי קבלות" on page 20 — not "שורת תשלום", which is our own vocabulary.
  expect(byCode.get("D120")).toBe("פרטי קבלות");
  expect(byCode.get("M100")).toBe("פריטים במלאי");
  expect(byCode.get("Z900")).toBe("רשומת סיום");
});

/**
 * ⛔ The distinction that makes reusing INI.TXT's list wrong.
 *
 * INI.TXT summarises the data records only. Appendix 4's printed table includes the
 * envelope. If someone ever "simplifies" one into the other, this fails.
 */
test("appendix 4 counts the envelope records and INI.TXT does not", () => {
  expect(BKMV_APPENDIX_4_RECORD_TABLE.map((r) => r.code)).toContain("A100");
  expect(BKMV_APPENDIX_4_RECORD_TABLE.map((r) => r.code)).toContain("Z900");
  expect(BKMV_SUMMARISED_RECORD_CODES).not.toContain("A100" as never);
  expect(BKMV_SUMMARISED_RECORD_CODES).not.toContain("Z900" as never);
});

test("a record type with no records gets no row at all, per page 20's footnote", () => {
  const rows = bkmvAppendix4RecordRows({ A100: 1, C100: 8, D110: 8, D120: 4, Z900: 1 });

  expect(rows.map((r) => r.code)).toEqual(["A100", "C100", "D110", "D120", "Z900"]);
  // Not a zero row: absent.
  expect(rows.some((r) => r.code === "B100")).toBe(false);
  expect(rows.some((r) => r.code === "M100")).toBe(false);
  expect(rows.find((r) => r.code === "D120")?.count).toBe(4);
});

test("zero is treated as absent, and so is a missing key", () => {
  const rows = bkmvAppendix4RecordRows({ A100: 1, C100: 3, D120: 0, Z900: 1 });
  expect(rows.map((r) => r.code)).toEqual(["A100", "C100", "Z900"]);
});

test("the range prints as DDMMYYYY", () => {
  expect(bkmvRangeDDMMYYYY("2025-01-01")).toBe("01012025");
  expect(bkmvRangeDDMMYYYY("2025-12-31")).toBe("31122025");
});

test("the production stamp is DD/MM/YY and hh:mm", () => {
  // 13 August 2026, 11:53.
  const stamp = bkmvProducedAtStamp(new Date(2026, 7, 13, 11, 53));
  expect(stamp.date).toBe("13/08/26");
  expect(stamp.time).toBe("11:53");
});

/**
 * ⛔ The invariant that keeps the printed sheet from contradicting itself.
 *
 * The report prints a time, and it prints a path whose last eight characters are
 * MMDDhhmm of the same instant. If those two are ever derived from different clocks —
 * which is exactly what happens the moment the time is formatted in the browser — a
 * printed report in Israel reads 14:53 beside a path ending 1153.
 */
test("the time on the report is the hhmm inside the path it prints", () => {
  const at = new Date(2026, 7, 13, 11, 53);
  const directory = bkmvExportDirectory({ dealerNumber: "515960508", at });
  const stamp = bkmvProducedAtStamp(at);

  const eight = directory.split("\\").pop() as string;
  expect(eight).toHaveLength(8);

  // MMDDhhmm — the last four are the time, and the time is what the line prints.
  expect(eight.slice(4)).toBe(stamp.time.replace(":", ""));
  // And the first four are month then day, per section 2.2.ג.
  expect(eight.slice(0, 4)).toBe("0813");
});

/**
 * The spec's own worked example, section 2.2, page 5:
 *
 *   "בתאריך 11 לספטמבר 2008 בשעה 10:25 נערכה ביקורת בבית עסק ... ומספר העוסק מורשה שלו
 *    הוא 002233445 ... נתיב הקבצים שייבנה לפי ההוראות לעיל הוא:
 *    F:\OPENFRMT\00223344.08\09111025"
 *
 * ⛔ This is the test that settles MMDDhhmm against DDMMhhmm. Section 2.2.ג defines the
 * eight characters as "MMDDhhmm. החודש, היום, השעה והדקה שבה הופקו הקבצים" and this
 * example agrees with it: September is 09, the day is 11, the time is 10:25.
 *
 * ⚠️ Appendix 4's own illustration on page 20 disagrees with both — it shows 17020140 for
 * 17/02/17 at 01:40, which is DDMMhhmm. The definition plus the worked example outrank a
 * single illustration, and this test is here so that reasoning is not re-litigated from
 * memory.
 */
test("the spec's own example reproduces exactly, dealer number and all", () => {
  const at = new Date(2008, 8, 11, 10, 25); // 11 September 2008, 10:25
  expect(bkmvExportDirectory({ dealerNumber: "002233445", at })).toBe(
    "OPENFRMT\\00223344.08\\09111025"
  );
});

/**
 * The second example on the same page: the same audit, an export five minutes later for
 * tax year 2005, producing a second directory beside the first.
 *
 *   "בשעה 10:30 הופקו נתונים עבור שנת 2005 ... F:\OPENFRMT\00223344.08\09111030"
 *
 * It also fixes what `.08` is: the PRODUCTION year, not the data year. The data covered
 * 2003-2004 in the first export and 2005 in the second, and both directories read `.08`.
 */
test("the two-digit suffix is the production year, not the year of the data", () => {
  const at = new Date(2008, 8, 11, 10, 30);
  expect(bkmvExportDirectory({ dealerNumber: "002233445", at })).toBe(
    "OPENFRMT\\00223344.08\\09111030"
  );
});
