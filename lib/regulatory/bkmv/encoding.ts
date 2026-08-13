import { BkmvError } from "./errors";

/**
 * Encode a Unicode string to ISO-8859-8-i.
 *
 * This is the charset the instructions require: field 1029 permits exactly two
 * values, `1` = ISO-8859-8-i and `2` = CP-862, and **Windows-1255 is not one of
 * them.** The `-i` suffix denotes implicit (logical) ordering, which is how the
 * characters are stored here — it is a direction convention, not a different byte
 * mapping.
 *
 * The bytes this produces did not change when the declaration did, and that is
 * not luck. For everything it emits — ASCII 0x20-0x7E and the 22 Hebrew letters
 * at 0xE0-0xFA — ISO-8859-8 and Windows-1255 are identical byte for byte, 122 of
 * 122. The two charsets diverge only above that, in the range Windows-1255 uses
 * for the shekel sign, niqqud and Western punctuation, and every one of those
 * characters is rejected below.
 *
 * Important: the strictness is the compliance. Widening this encoder to accept
 * more characters would start emitting bytes that mean nothing in ISO-8859-8, so
 * an unsupported character throws rather than being approximated.
 */
export function encodeIso88598i(input: string): Buffer {
  const bytes: number[] = [];

  for (const ch of input) {
    const cp = ch.codePointAt(0)!;

    // ASCII
    if (cp >= 0x00 && cp <= 0x7f) {
      bytes.push(cp);
      continue;
    }

    // Hebrew letters (א..ת)
    if (cp >= 0x05d0 && cp <= 0x05ea) {
      bytes.push(0xe0 + (cp - 0x05d0));
      continue;
    }

    // Hebrew punctuation: geresh / gershayim -> map to ASCII as a safe fallback
    if (cp === 0x05f3) {
      bytes.push(0x27); // '
      continue;
    }
    if (cp === 0x05f4) {
      bytes.push(0x22); // "
      continue;
    }

    throw new BkmvError("BKMV_ENCODING_UNSUPPORTED_CHAR", "Unsupported character for ISO-8859-8-i encoding", {
      char: ch,
      codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
    });
  }

  return Buffer.from(bytes);
}
