/**
 * Canonical Auditor company resolution.
 * Resolves the single company a user should use for Auditor (dashboard, invoices, scans, subscription).
 * Prefers paid/subscribed company over empty bootstrap company.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type CanonicalCompanyResult = {
  companyId: string
  source: "auth_user_id" | "company_members" | "paid_charges" | "paid_subscription" | "scans" | "email"
} | null

/**
 * Resolve canonical Auditor company for a user by id.
 * Prefers paid/subscribed company over empty bootstrap company.
 * Order: paid charges > subscription > scans > auth_user_id > company_members.
 */
export async function resolveCanonicalAuditorCompanyForUser(
  admin: SupabaseClient,
  userId: string
): Promise<CanonicalCompanyResult> {
  const companyIds = new Set<string>()
  const { data: owned } = await admin.from("companies").select("id").eq("auth_user_id", userId)
  for (const c of owned || []) if (c?.id) companyIds.add(c.id)
  const { data: members } = await admin.from("company_members").select("company_id").eq("user_id", userId)
  for (const m of members || []) if (m?.company_id) companyIds.add(m.company_id)

  if (companyIds.size === 0) return null

  const ids = Array.from(companyIds)

  // Prefer: charges > subscription > scans
  const { data: withCharges } = await admin
    .from("auditor_subscription_charges")
    .select("company_id")
    .eq("status", "succeeded")
    .in("company_id", ids)
    .limit(1)
    .maybeSingle()
  if (withCharges?.company_id) return { companyId: String(withCharges.company_id), source: "paid_charges" }

  const { data: withSub } = await admin
    .from("auditor_subscriptions")
    .select("company_id")
    .in("company_id", ids)
    .limit(1)
    .maybeSingle()
  if (withSub?.company_id) return { companyId: String(withSub.company_id), source: "paid_subscription" }

  const { data: withScans } = await admin
    .from("auditor_scans")
    .select("company_id")
    .in("company_id", ids)
    .limit(1)
    .maybeSingle()
  if (withScans?.company_id) return { companyId: String(withScans.company_id), source: "scans" }

  // Fallback: direct owner then membership
  const { data: byAuth } = await admin.from("companies").select("id").eq("auth_user_id", userId).limit(1).maybeSingle()
  if (byAuth?.id) return { companyId: String(byAuth.id), source: "auth_user_id" }

  const { data: byMember } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  if (byMember?.company_id) return { companyId: String(byMember.company_id), source: "company_members" }

  return null
}

/**
 * Resolve canonical Auditor company by user id or email.
 * For bootstrap: we have user id. For process-indicator: we may have user id from get_user_id_by_email.
 */
export async function resolveCanonicalAuditorCompany(
  admin: SupabaseClient,
  options: { userId?: string; email?: string }
): Promise<CanonicalCompanyResult> {
  if (options.userId) {
    const byUser = await resolveCanonicalAuditorCompanyForUser(admin, options.userId)
    if (byUser) return byUser
  }

  if (options.email) {
    const emailNorm = String(options.email || "").trim().toLowerCase()
    if (!emailNorm) return null

    // 4. Company by email (companies.email)
    const { data: byEmail } = await admin
      .from("companies")
      .select("id")
      .eq("email", emailNorm)
      .limit(1)
      .maybeSingle()
    if (byEmail?.id) return { companyId: String(byEmail.id), source: "email" }
  }

  return null
}
