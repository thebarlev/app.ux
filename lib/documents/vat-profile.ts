import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * An osek patur is not registered for VAT: it may not charge VAT on ANY
 * document it issues, and may not issue a tax invoice at all.
 *
 * `finalizeDocument` enforces both rules (lib/document-helpers.ts), rejecting
 * any document whose row carries vat_rate > 0 or vat_amount > 0. That guard is
 * the regulatory backstop and stays as-is — this module exists so the rows
 * never reach it carrying VAT in the first place.
 *
 * Why it is needed: `documents.vat_rate` is declared
 * `decimal(5,2) default 18` (scripts/006-tenant-isolation-and-audit.sql:120),
 * and the draft/save/issue write paths only set vat_rate for "item" document
 * types. A receipt therefore inherits 18 from the column default and is never
 * written again, so an osek patur was blocked from issuing one — with no way
 * to zero it from the UI, because the receipt form has no VAT field.
 */
export type CompanyVatProfile = {
  businessType: string
  /** true => every document this company issues must carry vat_rate 0 / vat_amount 0 */
  isVatExempt: boolean
}

export const VAT_EXEMPT_BUSINESS_TYPES = new Set(["osek_patur"])

/**
 * Reads the issuer's VAT standing. Uses the admin client so the answer does not
 * depend on the caller's RLS context — the same source `finalizeDocument`'s
 * guard reads, so the two can never disagree.
 *
 * Throws on a load failure rather than defaulting: callers use this to decide
 * whether to strip VAT, and silently assuming "not exempt" would recreate the
 * very block this module removes.
 */
export async function getCompanyVatProfile(companyId: string): Promise<CompanyVatProfile> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from("companies")
    .select("business_type")
    .eq("id", companyId)
    .maybeSingle()

  if (error) {
    // The technical detail belongs in the log; the thrown message reaches the
    // user through issueDocumentAction's catch, so it has to be readable.
    console.error("[vat-profile] business_type load failed", {
      company_id8: String(companyId || "").slice(0, 8),
      error: error.message,
    })
    throw new Error("לא ניתן לאמת את סוג העסק. נסה שוב בעוד רגע.")
  }

  const businessType = typeof (data as any)?.business_type === "string" ? String((data as any).business_type) : ""
  return { businessType, isVatExempt: VAT_EXEMPT_BUSINESS_TYPES.has(businessType) }
}

/**
 * Best-effort variant for read paths that must not fail the page render
 * (e.g. building a form's initial state). Falls back to "not exempt", which
 * only affects the number the form pre-fills — the write paths still call the
 * strict version, so an exempt issuer can never persist VAT.
 */
export async function isCompanyVatExemptSafe(companyId: string): Promise<boolean> {
  try {
    const { isVatExempt } = await getCompanyVatProfile(companyId)
    return isVatExempt
  } catch {
    return false
  }
}

/**
 * The single place that decides what vat_rate/vat_amount/subtotal a document row
 * gets written with.
 *
 * - VAT-exempt issuer: always zeroed, for EVERY document type — including the
 *   non-item types (receipt) that the normal path leaves untouched, which is
 *   exactly where the `default 18` leaked through.
 * - Everyone else: unchanged behaviour — item types carry the payload's VAT,
 *   non-item types are not written at all.
 */
export function buildTaxFields(params: {
  isItemDocument: boolean
  isVatExempt: boolean
  subtotal?: number | null
  total?: number | null
  vatRate?: number | null
  vatAmount?: number | null
}): Record<string, number> {
  const { isItemDocument, isVatExempt, subtotal, total, vatRate, vatAmount } = params

  if (isVatExempt) {
    const base = isItemDocument ? (subtotal ?? total ?? 0) : null
    return {
      ...(base !== null ? { subtotal: Number(base) || 0 } : {}),
      vat_rate: 0,
      vat_amount: 0,
    }
  }

  if (!isItemDocument) return {}

  return {
    subtotal: Number(subtotal ?? total ?? 0) || 0,
    vat_rate: Number(vatRate ?? 0) || 0,
    vat_amount: Number(vatAmount ?? 0) || 0,
  }
}
