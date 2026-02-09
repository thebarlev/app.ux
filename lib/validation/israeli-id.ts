/**
 * Israeli ID / Company number checksum validation (formal validity only).
 *
 * Rules:
 * - Digits only (input may include spaces/hyphens; they are ignored)
 * - Length up to 9 digits
 * - Left-pad with zeros to 9 digits for checksum calculation
 * - Weights: 1,2,1,2,1,2,1,2,1 (left to right)
 * - If product >= 10 subtract 9
 * - Sum % 10 === 0 => valid
 */

function normalize(value: string): string {
  return String(value || "").replace(/[\s-]/g, "").trim()
}

export function isValidIsraeliId(value: string): boolean {
  const raw = normalize(value)
  if (!raw) return false
  if (!/^\d+$/.test(raw)) return false
  if (raw.length > 9) return false

  const id = raw.padStart(9, "0")
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const digit = Number(id[i])
    const weight = i % 2 === 0 ? 1 : 2
    let product = digit * weight
    if (product >= 10) product -= 9
    sum += product
  }
  return sum % 10 === 0
}

/**
 * Bonus helper for tests/tools: given 8-digit base, compute check digit (0-9) or null.
 * Not used in production flows.
 */
export function computeIsraeliIdCheckDigit(base8: string): string | null {
  const raw = normalize(base8)
  if (!/^\d+$/.test(raw)) return null
  if (raw.length !== 8) return null

  for (let d = 0; d <= 9; d++) {
    const candidate = `${raw}${d}`
    if (isValidIsraeliId(candidate)) return String(d)
  }
  return null
}

export function normalizeIsraeliIdInput(value: string): string {
  return normalize(value)
}

