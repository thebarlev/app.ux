/**
 * הגדרת חשבונות ללא מגבלת מסמכים חודשית
 *
 * ניתן להגדיר ב-.env.local:
 * - UNLIMITED_DOCUMENT_EMAILS - רשימת אימיילים מופרדת בפסיקים (לדוגמה: support@uxellent.com)
 * - UNLIMITED_DOCUMENT_COMPANY_IDS - רשימת company IDs מופרדת בפסיקים (לדוגמה: 4ae68334-15a0-4fa3-a9ba-fd77deccc95d)
 *
 * המגבלה החודשית (documents_per_month) לא תחול על חשבונות אלה.
 */

const DEFAULT_UNLIMITED_EMAILS = ["support@uxellent.com"]
const DEFAULT_UNLIMITED_COMPANY_IDS = ["4ae68334-15a0-4fa3-a9ba-fd77deccc95d"]

function parseEnvList(key: string, fallback: string[], toLower = false): string[] {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  return raw
    .split(",")
    .map((s) => (toLower ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean)
}

export const UNLIMITED_DOCUMENT_EMAILS = parseEnvList(
  "UNLIMITED_DOCUMENT_EMAILS",
  DEFAULT_UNLIMITED_EMAILS,
  true
)

export const UNLIMITED_DOCUMENT_COMPANY_IDS = parseEnvList(
  "UNLIMITED_DOCUMENT_COMPANY_IDS",
  DEFAULT_UNLIMITED_COMPANY_IDS,
  false
)

export const UNLIMITED_DOCUMENTS_LIMIT = 1_000_000

export function isUnlimitedByEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return UNLIMITED_DOCUMENT_EMAILS.includes(email.trim().toLowerCase())
}

export function isUnlimitedByCompany(companyId: string | null | undefined): boolean {
  if (!companyId) return false
  return UNLIMITED_DOCUMENT_COMPANY_IDS.includes(companyId.trim())
}
