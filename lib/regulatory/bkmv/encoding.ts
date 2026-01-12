import { BkmvError } from "./errors";

/**
 * Encode a Unicode string to Windows-1255 (cp1255).
 *
 * Important: we intentionally keep this encoder strict and minimal.
 * - ASCII is supported.
 * - Hebrew letters U+05D0..U+05EA are mapped to bytes 0xE0..0xFA.
 * - Common punctuation is supported.
 * - Any unsupported character throws, to avoid producing non-compliant files silently.
 */
export function encodeWindows1255(input: string): Buffer {
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

    throw new BkmvError("BKMV_ENCODING_UNSUPPORTED_CHAR", "Unsupported character for Windows-1255 encoding", {
      char: ch,
      codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
    });
  }

  return Buffer.from(bytes);
}

