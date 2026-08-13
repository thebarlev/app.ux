import { BkmvError } from "./errors";
import { BKMV_AMOUNT_SIGN } from "./spec";
import type { BkmvAlign, BkmvAmountField, BkmvFieldSpec } from "./types";

/**
 * Renders a date into the eight digits the file requires.
 *
 * Section 2.4.ב: "שדות מסוג תאריך יהיו שדות נומריים באורך 8 תווים ובמבנה
 * YYYYMMDD". **Not DDMMYYYY** — an earlier revision of this function reversed it,
 * which would have put the day where the year belongs in every date field of
 * every record.
 *
 * The user-facing dialog in appendix 4 does take DDMMYYYY, which is probably where
 * the confusion came from. That is the input format, not the file format.
 */
export function formatDateYYYYMMDD(isoDate: string): string {
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Invalid date format; expected YYYY-MM-DD", { isoDate });
  }
  const [, y, mm, dd] = m;
  return `${y}${mm}${dd}`;
}

/** `hhmm`, per section 2.4.ג. */
export function formatTimeHHMM(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getHours())}${two(date.getMinutes())}`;
}

/** The `YYYY-MM-DD` of a Date in local time, for feeding `formatDateYYYYMMDD`. */
export function localIsoDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function pad(value: string, length: number, align: BkmvAlign, padChar: string): string {
  if (value.length > length) {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Field value exceeds fixed length", {
      value,
      length,
      actual: value.length,
    });
  }
  const padLen = length - value.length;
  const padding = padChar.repeat(padLen);
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
}

export function formatFieldValue(raw: any): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "boolean") return raw ? "1" : "0";
  return String(raw);
}

/**
 * Renders a fixed-point amount: an optional sign column, then the digits with the
 * decimal point **implied and never written**.
 *
 * `X9(12)v99` holds -1234.5 as `-` followed by `000000001234` and `50` — fifteen
 * columns, one separator-free run. A literal `.` or a minus glued to the digits
 * fails the file, which is why numbers never reach `formatFieldValue` on this path.
 */
export function formatAmount(raw: number | string, field: BkmvAmountField): string {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Amount field requires a finite number", {
      field: field.no,
      raw,
    });
  }

  const digitCount = field.intDigits + field.decDigits;
  const scaled = Math.round(Math.abs(value) * 10 ** field.decDigits);
  const digits = String(scaled);

  if (digits.length > digitCount) {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Amount exceeds the digits the field allows", {
      field: field.no,
      tech: field.tech,
      value,
      digits: digitCount,
    });
  }

  const body = digits.padStart(digitCount, "0");
  if (!field.signed) {
    if (value < 0) {
      throw new BkmvError("BKMV_FORMAT_VALIDATION", "Unsigned amount field cannot carry a negative value", {
        field: field.no,
        tech: field.tech,
        value,
      });
    }
    return body;
  }

  return `${value < 0 ? BKMV_AMOUNT_SIGN.negative : BKMV_AMOUNT_SIGN.positive}${body}`;
}

/** Alignment and padding are properties of the field kind, not choices. */
function renderField(spec: BkmvFieldSpec, value: any): string {
  // The thirteen cancelled X(0) fields consume no columns at all.
  if (spec.width === 0) return "";

  if (spec.kind === "amount") {
    if (value === null || value === undefined || value === "") {
      if (spec.requirement === "mandatory") {
        throw new BkmvError("BKMV_FORMAT_VALIDATION", "Missing required field", { field: spec.no });
      }
      // An absent optional amount is zero-filled, not space-filled: it is still numeric.
      return formatAmount(0, spec);
    }
    return formatAmount(value, spec);
  }

  const v = formatFieldValue(value);
  if (spec.requirement === "mandatory" && v === "") {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Missing required field", { field: spec.no });
  }

  return spec.kind === "numeric" ? pad(v, spec.width, "right", "0") : pad(v, spec.width, "left", " ");
}

export function buildFixedLengthRecord(fields: Array<{ spec: BkmvFieldSpec; value: any }>): string {
  return fields.map(({ spec, value }) => renderField(spec, value)).join("");
}
