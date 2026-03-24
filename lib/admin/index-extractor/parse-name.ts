export type ParsedName = {
  full_name: string
  first_name: string
  last_name: string
  confidence: number
}

const BUSINESS_HINTS = [
  "ltd",
  "ltd.",
  "inc",
  "inc.",
  "llc",
  "corp",
  "corporation",
  "company",
  "co.",
  "studio",
  "agency",
  "clinic",
  "office",
  "group",
  "solutions",
  "services",
  "association",
  "foundation",
  "department",
  "city of",
  "municipality",
  "בעמ",
  "בע\"מ",
  "בע״מ",
  "חברה",
  "ארגון",
  "עסק",
  "עמותה",
]

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function isLikelyPersonName(full: string): boolean {
  if (!full) return false
  if (/\d/.test(full)) return false
  if (/[|<>]/.test(full)) return false
  const words = full.split(" ").filter(Boolean)
  if (words.length < 2 || words.length > 4) return false
  return words.every((word) => word.length >= 2 && word.length <= 24)
}

export function parseNameConservatively(candidate: string): ParsedName {
  const full = normalizeWhitespace(candidate)
  if (!full) return { full_name: "", first_name: "", last_name: "", confidence: 0 }

  const lower = full.toLowerCase()
  if (BUSINESS_HINTS.some((hint) => lower.includes(hint))) {
    return { full_name: full, first_name: "", last_name: "", confidence: 0.15 }
  }

  if (!isLikelyPersonName(full)) {
    return { full_name: full, first_name: "", last_name: "", confidence: 0.35 }
  }

  const parts = full.split(" ").filter(Boolean)
  const first = parts[0]
  const last = parts[parts.length - 1]

  if (first.length < 2 || last.length < 2) {
    return { full_name: full, first_name: "", last_name: "", confidence: 0.4 }
  }

  return {
    full_name: full,
    first_name: first,
    last_name: last,
    confidence: 0.82,
  }
}
