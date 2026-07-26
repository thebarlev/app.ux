/**
 * ITA returns the allocation approval as a single `confirmation_number`, which
 * we store verbatim in `documents.allocation_number`. Observed shape (sandbox):
 *
 *   20260726192153982206074530
 *   └───────┬───────┘└───┬───┘
 *    17-char timestamp    9-digit allocation number
 *    yyyymmddhhmmssSSS    ("מספר הקצאה")
 *
 *   20260726192153982 -> 2026-07-26 19:21:53.982
 *
 * Only the 9-digit part is the allocation number a reader is looking for; the
 * timestamp prefix is ITA's issuance stamp. Printing the concatenation made the
 * field read as two numbers stuck together.
 *
 * The stored value is never modified — this is a display concern only, and the
 * full string stays available (and stays in the DB) for audit and support.
 */

/** Length of ITA's yyyymmddhhmmssSSS prefix. */
const TIMESTAMP_PREFIX_LENGTH = 17
/** Length of the allocation number itself. */
const ALLOCATION_DIGITS = 9
const COMBINED_LENGTH = TIMESTAMP_PREFIX_LENGTH + ALLOCATION_DIGITS

/**
 * True when `value` is exactly the known ITA shape: all digits, the expected
 * total length, and a prefix that parses as a real calendar timestamp.
 *
 * Deliberately strict. This runs on a regulated document, so an unrecognised
 * format must be shown whole rather than blindly truncated to its last 9
 * characters — showing a wrong allocation number is worse than showing a long one.
 */
function hasItaTimestampPrefix(value: string): boolean {
  if (value.length !== COMBINED_LENGTH) return false
  if (!/^\d+$/.test(value)) return false

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(8, 10))
  const minute = Number(value.slice(10, 12))
  const second = Number(value.slice(12, 14))

  if (year < 2020 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (hour > 23 || minute > 59 || second > 59) return false

  return true
}

export type AllocationNumberParts = {
  /** Exactly what ITA returned and what is stored — never shortened. */
  full: string
  /** What the document shows: the 9-digit allocation number when recognised. */
  display: string
  /** The stripped timestamp prefix, empty when there was none. */
  timestampPrefix: string
  /** Whether the ITA timestamp+allocation shape was recognised. */
  hasTimestampPrefix: boolean
}

/**
 * Splits a stored allocation number into what to show and what to keep.
 * Returns null for an absent value so callers can branch on presence.
 */
export function parseAllocationNumber(raw: unknown): AllocationNumberParts | null {
  if (raw === null || raw === undefined) return null
  const full = String(raw).trim()
  if (!full) return null

  if (!hasItaTimestampPrefix(full)) {
    // Unknown shape — show it exactly as received.
    return { full, display: full, timestampPrefix: "", hasTimestampPrefix: false }
  }

  return {
    full,
    display: full.slice(TIMESTAMP_PREFIX_LENGTH),
    timestampPrefix: full.slice(0, TIMESTAMP_PREFIX_LENGTH),
    hasTimestampPrefix: true,
  }
}

/** Convenience for UI that only needs the printable value. */
export function formatAllocationNumber(raw: unknown): string | null {
  return parseAllocationNumber(raw)?.display ?? null
}
