import type { BkmvRecordCode, BkmvSpec } from "./types";
import { BkmvError } from "./errors";

/**
 * IMPORTANT:
 * This file is the executable spec used by the generator.
 * It MUST mirror `docs/regulatory/bkmv/spec.md`.
 *
 * We intentionally ship this as incomplete until the official 5.4 tables
 * (field order/length/padding/required rules) are pasted in and verified.
 * The exporter will refuse to run while spec is incomplete.
 */

export const BKMV_SPEC_VERSION = "5.4-TBD";

function recordCodeOnly(code: BkmvRecordCode) {
  return {
    code,
    fields: [
      {
        name: "record_code",
        length: 4,
        align: "left" as const,
        padChar: " " as const,
        required: true,
      },
      // TODO(5.4): Add the remaining fields for this record code (fixed-length tables).
    ],
  };
}

export const BKMV_SPEC: BkmvSpec = {
  version: BKMV_SPEC_VERSION,
  records: {
    A100: recordCodeOnly("A100"),
    B100: recordCodeOnly("B100"),
    B110: recordCodeOnly("B110"),
    C100: recordCodeOnly("C100"),
    D110: recordCodeOnly("D110"),
    D120: recordCodeOnly("D120"),
    M100: recordCodeOnly("M100"),
    Z900: recordCodeOnly("Z900"),
  },
};

export function assertBkmvSpecComplete(): void {
  const incomplete = Object.values(BKMV_SPEC.records).filter((r) => r.fields.length <= 1);
  if (incomplete.length > 0) {
    throw new BkmvError(
      "BKMV_SPEC_INCOMPLETE",
      "BKMV spec is incomplete. Populate fixed-length field tables in lib/regulatory/bkmv/spec.ts based on docs/regulatory/bkmv/spec.md (5.4).",
      { recordCodes: incomplete.map((r) => r.code), specVersion: BKMV_SPEC.version }
    );
  }
}

