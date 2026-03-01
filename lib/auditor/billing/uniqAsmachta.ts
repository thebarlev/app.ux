function yyyymmddFromIso(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}${mm}${dd}`
}

export function uniqAsmachtaAuditor(companyId: string, periodStartIso: string): string {
  const compact = String(companyId).replaceAll("-", "")
  const shortId = compact.slice(0, 12)
  const ymd = yyyymmddFromIso(periodStartIso)
  // keep short for Cardcom constraints
  return `a:${shortId}:${ymd}`
}

