"use server"

import { revalidatePath } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"

function normalizeIds(companyIds: string[]) {
  return Array.from(new Set((companyIds || []).map((companyId) => String(companyId || "").trim()).filter(Boolean)))
}

function buildInList(ids: string[]) {
  return ids.map((id) => `"${id}"`).join(",")
}

async function deleteAuditorClientsInternal(companyIds: string[]): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()

  const ids = normalizeIds(companyIds)
  if (ids.length === 0) return { ok: false, error: "No clients selected" }

  const admin = createServiceRoleClient()
  const idsList = buildInList(ids)
  const { data: selectedCompanies, error: selectedCompaniesError } = await admin
    .from("companies")
    .select("id, auth_user_id")
    .in("id", ids)

  if (selectedCompaniesError) return { ok: false, error: selectedCompaniesError.message }

  const foundIds = (selectedCompanies ?? []).map((row) => String((row as any).id || "")).filter(Boolean)
  if (foundIds.length === 0) return { ok: false, error: "Selected clients were not found" }

  const { data: activeSubscriptions, error: activeSubscriptionsError } = await admin
    .from("auditor_subscriptions")
    .select("company_id, status")
    .in("company_id", foundIds)
    .eq("status", "active")

  if (activeSubscriptionsError) return { ok: false, error: activeSubscriptionsError.message }

  const activeCompanyIds = new Set(
    (activeSubscriptions ?? [])
      .map((row) => (typeof (row as any).company_id === "string" ? (row as any).company_id : null))
      .filter((value): value is string => !!value),
  )

  if (activeCompanyIds.size > 0) {
    return { ok: false, error: "Active subscription accounts cannot be deleted" }
  }

  const authUserIds = Array.from(
    new Set(
      (selectedCompanies ?? [])
        .map((row) => (typeof (row as any).auth_user_id === "string" ? (row as any).auth_user_id : null))
        .filter((value): value is string => !!value),
    ),
  )

  const { data: ownerMemberships, error: ownerMembershipsError } = await admin
    .from("company_members")
    .select("company_id, user_id, role")
    .in("company_id", foundIds)
    .eq("role", "owner")
  if (ownerMembershipsError) return { ok: false, error: ownerMembershipsError.message }

  const candidateAuthUserIds = Array.from(
    new Set([
      ...authUserIds,
      ...(ownerMemberships ?? [])
        .map((row) => (typeof (row as any).user_id === "string" ? (row as any).user_id : null))
        .filter((value): value is string => !!value),
    ]),
  )

  const deletableAuthUserIds = new Set<string>()
  if (candidateAuthUserIds.length > 0) {
    const [{ data: allOwnedCompanies, error: allOwnedCompaniesError }, { data: allMemberships, error: allMembershipsError }, { data: systemAdmins, error: systemAdminsError }] = await Promise.all([
      admin
        .from("companies")
        .select("id, auth_user_id")
        .in("auth_user_id", candidateAuthUserIds),
      admin
        .from("company_members")
        .select("company_id, user_id")
        .in("user_id", candidateAuthUserIds),
      admin
        .from("system_admins")
        .select("auth_user_id")
        .in("auth_user_id", candidateAuthUserIds),
    ])

    if (allOwnedCompaniesError) return { ok: false, error: allOwnedCompaniesError.message }
    if (allMembershipsError) return { ok: false, error: allMembershipsError.message }
    if (systemAdminsError) return { ok: false, error: systemAdminsError.message }

    const selectedIdSet = new Set(foundIds)
    const systemAdminUserIds = new Set(
      (systemAdmins ?? [])
        .map((row) => (typeof (row as any).auth_user_id === "string" ? (row as any).auth_user_id : null))
        .filter((value): value is string => !!value),
    )
    const ownedCompanyIdsByUser = new Map<string, string[]>()
    const membershipCompanyIdsByUser = new Map<string, string[]>()

    for (const row of allOwnedCompanies ?? []) {
      const authUserId = typeof (row as any).auth_user_id === "string" ? (row as any).auth_user_id : null
      const companyId = typeof (row as any).id === "string" ? (row as any).id : null
      if (!authUserId || !companyId) continue
      const current = ownedCompanyIdsByUser.get(authUserId) ?? []
      current.push(companyId)
      ownedCompanyIdsByUser.set(authUserId, current)
    }

    for (const row of allMemberships ?? []) {
      const authUserId = typeof (row as any).user_id === "string" ? (row as any).user_id : null
      const companyId = typeof (row as any).company_id === "string" ? (row as any).company_id : null
      if (!authUserId || !companyId) continue
      const current = membershipCompanyIdsByUser.get(authUserId) ?? []
      current.push(companyId)
      membershipCompanyIdsByUser.set(authUserId, current)
    }

    for (const authUserId of candidateAuthUserIds) {
      if (systemAdminUserIds.has(authUserId)) continue
      const ownedCompanyIds = ownedCompanyIdsByUser.get(authUserId) ?? []
      const membershipCompanyIds = membershipCompanyIdsByUser.get(authUserId) ?? []
      const allLinkedCompanyIds = Array.from(new Set([...ownedCompanyIds, ...membershipCompanyIds]))
      if (allLinkedCompanyIds.length > 0 && allLinkedCompanyIds.every((companyId) => selectedIdSet.has(companyId))) {
        deletableAuthUserIds.add(authUserId)
      }
    }
  }

  const { error: billingDocumentsError } = await admin
    .from("billing_documents")
    .delete()
    .in("buyer_company_id", foundIds)
  if (billingDocumentsError) return { ok: false, error: billingDocumentsError.message }

  const { error: auditorInvoiceDocumentsError } = await admin
    .from("auditor_invoice_documents")
    .delete()
    .or(`buyer_company_id.in.(${idsList}),issuer_company_id.in.(${idsList})`)
  if (auditorInvoiceDocumentsError) return { ok: false, error: auditorInvoiceDocumentsError.message }

  const { error: companiesDeleteError } = await admin
    .from("companies")
    .delete()
    .in("id", foundIds)
  if (companiesDeleteError) return { ok: false, error: companiesDeleteError.message }

  for (const authUserId of deletableAuthUserIds) {
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId)
    if (authDeleteError) return { ok: false, error: authDeleteError.message }
  }

  revalidatePath("/admin/auditor/clients")
  for (const companyId of foundIds) {
    revalidatePath(`/admin/companies/${companyId}`)
  }

  return { ok: true }
}

export async function deleteAuditorClient(companyId: string): Promise<{ ok: boolean; error?: string }> {
  return deleteAuditorClientsInternal([companyId])
}

export async function deleteAuditorClients(companyIds: string[]): Promise<{ ok: boolean; error?: string }> {
  return deleteAuditorClientsInternal(companyIds)
}

export async function disableAuditorClient(companyId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()

  const id = String(companyId || "").trim()
  if (!id) return { ok: false, error: "No client selected" }

  const admin = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  const { error: companyError } = await admin
    .from("companies")
    .update({ status: "suspended" } as any)
    .eq("id", id)

  if (companyError) return { ok: false, error: companyError.message }

  const { error: subscriptionError } = await admin
    .from("auditor_subscriptions")
    .update({
      status: "blocked",
      cancel_at_period_end: true,
      canceled_at: nowIso,
      next_billing_date: null,
    } as any)
    .eq("company_id", id)
    .eq("status", "active")

  if (subscriptionError) return { ok: false, error: subscriptionError.message }

  revalidatePath("/admin/auditor/clients")
  revalidatePath(`/admin/companies/${id}`)

  return { ok: true }
}
