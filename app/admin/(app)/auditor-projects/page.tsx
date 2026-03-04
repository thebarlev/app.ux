import { createServiceRoleClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorProjectsClient from "./AuditorProjectsClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorProjectsPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect("/admin/login")

  const { data: adminRow } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle()
  if (!adminRow?.id) redirect("/dashboard?error=unauthorized")

  const admin = createServiceRoleClient()

  const { data: projects, error } = await admin
    .from("auditor_projects")
    .select(
      `
      id,
      domain,
      website_url,
      status,
      created_at,
      customer_id,
      auditor_customers (
        id,
        customer_status,
        last_payment_at,
        next_charge_at,
        last_charge_status,
        last_charge_error,
        lead_id,
        auditor_leads (full_name, email, phone)
      )
    `
    )
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Auditor Projects</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive">
          Failed to load projects: {error.message}
        </div>
      </div>
    )
  }

  const normalized = (projects || []).map((p: any) => {
    const cust = p.auditor_customers
    const custSingle = Array.isArray(cust) ? cust[0] ?? null : cust
    const lead = custSingle?.auditor_leads
    const leadSingle = Array.isArray(lead) ? lead[0] ?? null : lead
    return {
      ...p,
      auditor_customers: custSingle
        ? { ...custSingle, auditor_leads: leadSingle }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Auditor Projects – CRM</h1>
      <p className="text-muted-foreground">
        Projects created after payment success. Only active customers can run scans.
      </p>
      <AuditorProjectsClient projects={normalized} />
    </div>
  )
}
