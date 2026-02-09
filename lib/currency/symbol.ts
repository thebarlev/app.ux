export function currencySymbol(input: string | null | undefined): string {
  const raw = String(input ?? "").trim()
  if (!raw) return "₪"

  const c = raw.toUpperCase()

  if (c === "ILS" || c === "NIS" || raw === "₪") return "₪"
  if (c === "USD" || raw === "$") return "$"
  if (c === "EUR" || raw === "€") return "€"
  if (c === "GBP" || raw === "£") return "£"

  // Unknown currency: fall back to code (better than blank).
  return c
}

