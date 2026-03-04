/**
 * Ensures the paying user has a customer company and membership.
 * Used in the Auditor payment success path so user_company_ids() includes the company.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type EnsureInput = {
  userId: string | null
  leadId?: string | null
  email: string
  fullName?: string
  phone?: string
  normalizedHost?: string
  websiteUrl?: string
}

export type EnsureResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string }

/**
 * Resolve or create customer company and ensure user is linked.
 * - If userId has company (membership or auth_user_id), return it.
 * - If leadId + email: find or create company, then ensure userId is linked.
 * - Never use billing/issuer company as customer company.
 */
export async function ensureAuditorCustomerCompanyForUser(
  admin: SupabaseClient,
  input: EnsureInput
): Promise<EnsureResult> {
  const { userId, leadId, email, fullName, phone, normalizedHost, websiteUrl } = input
  const leadEmail = String(email || "").trim().toLowerCase()
  if (!leadEmail) return { ok: false, error: "email_required" }

  // 1) If userId exists, check for existing company
  if (userId) {
    const { data: byAuth } = await admin
      .from("companies")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle()
    if (byAuth?.id) return { ok: true, companyId: String(byAuth.id) }

    const { data: byMember } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
    if (byMember?.company_id) return { ok: true, companyId: String(byMember.company_id) }
  }

  // 2) Find existing company by email
  const { data: existingCompany } = await admin
    .from("companies")
    .select("id,auth_user_id")
    .eq("email", leadEmail)
    .maybeSingle()

  let companyId: string | null = existingCompany?.id ? String(existingCompany.id) : null

  // 3) Create company if missing
  if (!companyId) {
    const firstName = (fullName || "").split(/\s+/).filter(Boolean)[0] || "לקוח"
    let companyName = normalizedHost || fullName || "Auditor customer"
    if (!companyName || companyName === "Auditor customer") {
      try {
        if (websiteUrl) companyName = new URL(websiteUrl).hostname || companyName
      } catch {
        /* ignore */
      }
    }

    const { data: inserted, error: insErr } = await admin
      .from("companies")
      .insert({
        company_name: companyName,
        business_type: "other",
        tax_id: null,
        contact_first_name: firstName,
        contact_full_name: fullName || firstName,
        email: leadEmail,
        mobile_phone: phone || null,
        status: "active",
        auth_user_id: userId,
      } as any)
      .select("id")
      .single()

    if (!insErr && inserted?.id) {
      companyId = String(inserted.id)
    } else {
      const { data: again } = await admin.from("companies").select("id").eq("email", leadEmail).maybeSingle()
      companyId = again?.id ? String(again.id) : null
    }
  }

  if (!companyId) return { ok: false, error: "company_create_failed" }

  // 4) Ensure user is linked (membership + auth_user_id) when we have userId
  if (userId) {
    const { data: company } = await admin.from("companies").select("auth_user_id").eq("id", companyId).single()
    const currentAuth = (company as any)?.auth_user_id
    const needsAuthLink = !currentAuth || currentAuth === userId
    if (needsAuthLink) {
      const { error: updErr } = await admin
        .from("companies")
        .update({ auth_user_id: userId } as any)
        .eq("id", companyId)
      if (updErr) {
        console.warn("[ensureAuditorCustomerCompany] companies.auth_user_id update failed", { companyId, userId, error: String(updErr?.message || updErr) })
      }
    }

    const { error: memberErr } = await admin.from("company_members").upsert(
      {
        company_id: companyId,
        user_id: userId,
        role: "owner",
        accepted_at: new Date().toISOString(),
      } as any,
      { onConflict: "company_id,user_id" }
    )
    if (memberErr) {
      console.warn("[ensureAuditorCustomerCompany] company_members upsert failed", { companyId, userId, error: String(memberErr?.message || memberErr) })
    }
  }

  return { ok: true, companyId }
}
