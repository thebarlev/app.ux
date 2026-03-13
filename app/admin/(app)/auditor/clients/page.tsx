import { redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorClientsTable, type AuditorClientRow } from "@/components/admin/auditor/AdminAuditorClientsTable"

export const dynamic = "force-dynamic"

type SearchParams = {
  q?: string
  active?: string
}

type CompanyRow = {
  id: string
  company_name: string | null
  contact_full_name: string | null
  email: string | null
  auth_user_id: string | null
  created_at: string
}

export default async function AdminAuditorClientsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const admin = createServiceRoleClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/admin/login")

  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!adminData?.id) redirect("/dashboard?error=unauthorized")

  const query = String(searchParams.q || "").trim()
  const activeOnly = searchParams.active === "1"

  const [{ data: intakeCompanies }, { data: subscriptionCompanies }, { data: scanCompanies }] = await Promise.all([
    admin.from("auditor_client_intake").select("company_id"),
    admin.from("auditor_subscriptions").select("company_id, status"),
    admin.from("auditor_scans").select("company_id"),
  ])

  const companyIds = new Set<string>()
  for (const row of intakeCompanies ?? []) {
    if (typeof (row as any)?.company_id === "string") companyIds.add((row as any).company_id)
  }
  const activeSubscriptionCompanyIds = new Set<string>()
  for (const row of subscriptionCompanies ?? []) {
    if (typeof (row as any)?.company_id === "string") {
      companyIds.add((row as any).company_id)
      if ((row as any).status === "active") activeSubscriptionCompanyIds.add((row as any).company_id)
    }
  }
  for (const row of scanCompanies ?? []) {
    if (typeof (row as any)?.company_id === "string") companyIds.add((row as any).company_id)
  }

  const baseCompanyIds = activeOnly ? activeSubscriptionCompanyIds : companyIds

  if (baseCompanyIds.size === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditor Clients</h1>
          <p className="mt-1 text-slate-500">Centralized view of Auditor customers and onboarding progress.</p>
        </div>
        <AdminAuditorClientsTable rows={[]} query={query} activeOnly={activeOnly} />
      </div>
    )
  }

  let companiesQuery = admin
    .from("companies")
    .select("id, company_name, contact_full_name, email, auth_user_id, created_at")
    .in("id", Array.from(baseCompanyIds))
    .order("created_at", { ascending: false })

  if (query) {
    const escaped = query.replace(/[%]/g, "")
    companiesQuery = companiesQuery.or(
      `company_name.ilike.%${escaped}%,email.ilike.%${escaped}%,contact_full_name.ilike.%${escaped}%`
    )
  }

  const { data: companies, error } = await companiesQuery

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditor Clients</h1>
          <p className="mt-1 text-slate-500">Centralized view of Auditor customers and onboarding progress.</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Error loading clients: {error.message}
        </div>
      </div>
    )
  }

  const filteredCompanyIds = (companies ?? []).map((company) => company.id)

  const [{ data: intakes }, { data: subscriptions }, { data: scans }] = await Promise.all([
    admin
      .from("auditor_client_intake")
      .select("company_id, user_id, created_at")
      .in("company_id", filteredCompanyIds)
      .order("created_at", { ascending: false }),
    admin
      .from("auditor_subscriptions")
      .select("company_id, plan_id, status, updated_at")
      .in("company_id", filteredCompanyIds),
    admin
      .from("auditor_scans")
      .select("company_id, created_at")
      .in("company_id", filteredCompanyIds)
      .order("created_at", { ascending: false }),
  ])

  const latestIntakeByCompany = new Map<string, { created_at: string; user_id: string | null }>()
  for (const row of intakes ?? []) {
    const companyId = String((row as any).company_id || "")
    if (!companyId || latestIntakeByCompany.has(companyId)) continue
    latestIntakeByCompany.set(companyId, {
      created_at: String((row as any).created_at || ""),
      user_id: typeof (row as any).user_id === "string" ? (row as any).user_id : null,
    })
  }

  const subscriptionByCompany = new Map<string, { plan_id: string | null; status: string | null }>()
  for (const row of subscriptions ?? []) {
    const companyId = String((row as any).company_id || "")
    if (!companyId) continue
    subscriptionByCompany.set(companyId, {
      plan_id: typeof (row as any).plan_id === "string" ? (row as any).plan_id : null,
      status: typeof (row as any).status === "string" ? (row as any).status : null,
    })
  }

  const lastScanByCompany = new Map<string, string>()
  for (const row of scans ?? []) {
    const companyId = String((row as any).company_id || "")
    if (!companyId || lastScanByCompany.has(companyId)) continue
    const createdAt = String((row as any).created_at || "")
    if (createdAt) lastScanByCompany.set(companyId, createdAt)
  }

  const authUserIds = Array.from(
    new Set((companies ?? []).map((company) => company.auth_user_id).filter((value): value is string => !!value))
  )
  const authEmailById = new Map<string, string>()

  await Promise.all(
    authUserIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId)
      const email = data?.user?.email
      if (email) authEmailById.set(userId, email)
    })
  )

  const rows: AuditorClientRow[] = ((companies ?? []) as CompanyRow[])
    .map((company) => {
      const intake = latestIntakeByCompany.get(company.id)
      const subscription = subscriptionByCompany.get(company.id)
      return {
        companyId: company.id,
        companyName: company.company_name || "—",
        fullName: company.contact_full_name || null,
        email: authEmailById.get(company.auth_user_id || "") || company.email || null,
        joinedAt: company.created_at,
        plan: subscription?.plan_id || null,
        subscriptionStatus: subscription?.status || null,
        intakeCompleted: !!intake,
        lastScanAt: lastScanByCompany.get(company.id) || null,
      }
    })
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditor Clients</h1>
        <p className="mt-1 text-slate-500">Centralized view of Auditor customers and onboarding progress.</p>
      </div>

      <AdminAuditorClientsTable rows={rows} query={query} activeOnly={activeOnly} />
    </div>
  )
}
