/**
 * Transliteration, applied **before** encoding.
 *
 * `encoding.ts` stays strict and is not touched: it accepts ASCII and the 22
 * Hebrew letters and throws on anything else, and that strictness is what keeps
 * the output inside ISO-8859-8. This table sits in front of it and rewrites the
 * handful of typographic characters that appear in real business text and have an
 * exact ASCII equivalent.
 *
 * Everything not in the table is left alone. If it is also not encodable, the
 * encoder throws with the character named. That is the rule and there is no
 * exception to it — a character nobody decided about must stop the export, not
 * become a guess.
 */

/** One transliteration that happened, so it can be reported rather than absorbed. */
export type BkmvTransliteration = {
  field: number;
  documentNumber: string | null;
  /** -1 for a document-level field, which has no line. */
  lineNumber: number;
  original: string;
  written: string;
};

/**
 * The approved table. Each entry is a typographic character with an unambiguous
 * ASCII equivalent — not an approximation of meaning.
 *
 * The precedent for this already existed inside the encoder, which mapped the
 * Hebrew geresh and gershayim to `'` and `"`. This is the same move, in one place,
 * where it can be counted.
 */
export const BKMV_TRANSLITERATIONS: Readonly<Record<string, string>> = {
  "–": "-", // – en dash
  "—": "-", // — em dash
  "‘": "'", // ‘ left single quote
  "’": "'", // ’ right single quote
  "“": '"', // “ left double quote
  "”": '"', // ” right double quote
  "…": "...", // … ellipsis
  " ": " ", // non-breaking space
};

const PATTERN = new RegExp(`[${Object.keys(BKMV_TRANSLITERATIONS).join("")}]`, "g");

/**
 * Rewrites what the table covers and records that it happened.
 *
 * Note that `…` becomes three characters, so a transliterated value can be longer
 * than the original. This runs before any truncation for exactly that reason — the
 * width a field has to satisfy is the width after transliteration.
 */
export function transliterate(
  value: string,
  meta: { field: number; documentNumber: string | null; lineNumber: number },
  sink?: BkmvTransliteration[]
): string {
  if (!PATTERN.test(value)) return value;
  PATTERN.lastIndex = 0;

  const written = value.replace(PATTERN, (ch) => BKMV_TRANSLITERATIONS[ch]);
  sink?.push({ ...meta, original: value, written });
  return written;
}
