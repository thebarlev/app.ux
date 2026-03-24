import { INDEX_EXTRACTOR_CSV_HEADERS, type ExtractedRow } from "@/lib/admin/index-extractor/types"

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const raw = String(value)
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export function buildIndexExtractorCsv(rows: ExtractedRow[]): string {
  const header = INDEX_EXTRACTOR_CSV_HEADERS.join(",")
  const lines = rows.map((row) => INDEX_EXTRACTOR_CSV_HEADERS.map((key) => csvEscape(row[key])).join(","))
  return [header, ...lines].join("\n") + "\n"
}
