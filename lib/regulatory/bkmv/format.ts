import { BkmvError } from "./errors";
import type { BkmvAlign, BkmvFieldSpec } from "./types";

export function formatDateDDMMYYYY(isoDate: string): string {
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new BkmvError("BKMV_FORMAT_VALIDATION", "Invalid date format; expected YYYY-MM-DD", { isoDate });
  }
  const [, y, mm, dd] = m;
  return `${dd}${mm}${y}`;
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

export function buildFixedLengthRecord(fields: Array<{ spec: BkmvFieldSpec; value: any }>): string {
  return fields
    .map(({ spec, value }) => {
      const v = formatFieldValue(value);
      if (spec.required && v === "") {
        throw new BkmvError("BKMV_FORMAT_VALIDATION", "Missing required field", { field: spec.name });
      }
      return pad(v, spec.length, spec.align, spec.padChar);
    })
    .join("");
}

