import { INDEX_EXTRACTOR_CSV_HEADERS, type ExtractedRow } from "@/lib/admin/index-extractor/types"
import { normalizeAndClassifyPhone } from "@/lib/admin/index-extractor/normalize-phone"

function normEmail(value: string): string {
  return String(value || "").trim().toLowerCase()
}

function rowScore(row: ExtractedRow): number {
  return Number(row.confidence_score || "0") || 0
}

function choosePrimary(a: ExtractedRow, b: ExtractedRow): [ExtractedRow, ExtractedRow] {
  if (rowScore(a) >= rowScore(b)) return [a, b]
  return [b, a]
}

function mergeRows(a: ExtractedRow, b: ExtractedRow): ExtractedRow {
  const [primary, secondary] = choosePrimary(a, b)
  const out: ExtractedRow = { ...primary }
  for (const k of INDEX_EXTRACTOR_CSV_HEADERS) {
    const v = secondary[k]
    if (!out[k] && v) out[k] = v
  }
  if (!out.lead_score && secondary.lead_score) out.lead_score = secondary.lead_score
  if (!out.lead_grade && secondary.lead_grade) out.lead_grade = secondary.lead_grade
  if (!out.lead_summary && secondary.lead_summary) out.lead_summary = secondary.lead_summary
  if (!out.lead_signals && secondary.lead_signals) out.lead_signals = secondary.lead_signals
  if (secondary.notes) {
    out.notes = out.notes ? `${out.notes}; merged_duplicate` : "merged_duplicate"
  }
  return out
}

export function dedupeRows(rows: ExtractedRow[]): ExtractedRow[] {
  const byEmail = new Map<string, ExtractedRow>()
  const byPhone = new Map<string, ExtractedRow>()
  const output: ExtractedRow[] = []

  for (const row of rows) {
    const emailKey = normEmail(row.email)
    const normalizedPhone = normalizeAndClassifyPhone(row.mobile || row.phone).normalized
    const phoneKey = String(normalizedPhone || "").trim()

    let existing: ExtractedRow | undefined
    if (emailKey) existing = byEmail.get(emailKey)
    if (!existing && phoneKey) existing = byPhone.get(phoneKey)

    if (!existing) {
      output.push(row)
      if (emailKey) byEmail.set(emailKey, row)
      if (phoneKey) byPhone.set(phoneKey, row)
      continue
    }

    const merged = mergeRows(existing, row)
    const idx = output.indexOf(existing)
    if (idx >= 0) output[idx] = merged
    if (emailKey) byEmail.set(emailKey, merged)
    if (phoneKey) byPhone.set(phoneKey, merged)
  }

  return output
}
