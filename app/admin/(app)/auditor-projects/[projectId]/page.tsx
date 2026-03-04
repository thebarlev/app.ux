import { notFound } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorProjectDetailClient from "./AuditorProjectDetailClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
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

  const { data: project, error } = await admin
    .from("auditor_projects")
    .select(
      `
      id,
      domain,
      website_url,
      status,
      created_at,
      updated_at,
      keyword_1,
      keyword_2,
      keyword_3,
      business_type,
      seo_goal,
      region_type,
      region_value,
      customer_id,
      auditor_customers (
        id,
        company_id,
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
    .eq("id", projectId)
    .single()

  if (error || !project) notFound()

  const cust = (project as any).auditor_customers
  const custSingle = Array.isArray(cust) ? cust[0] ?? null : cust
  const lead = custSingle?.auditor_leads
  const leadSingle = Array.isArray(lead) ? lead[0] ?? null : lead

  const { data: scans } = await admin
    .from("auditor_scans")
    .select("id, status, step, created_at, target_url")
    .eq("company_id", (custSingle as any)?.company_id ?? "")
    .order("created_at", { ascending: false })
    .limit(20)

  let notes: unknown[] = []
  let tasks: unknown[] = []
  try {
    const n = await admin.from("auditor_project_notes").select("id, content, created_at").eq("project_id", projectId).order("created_at", { ascending: false })
    notes = n.data || []
  } catch {
    /* tables may not exist before migration 099 */
  }
  try {
    const t = await admin.from("auditor_project_tasks").select("id, title, description, status, due_date, created_at").eq("project_id", projectId).order("created_at", { ascending: false })
    tasks = t.data || []
  } catch {
    /* tables may not exist before migration 099 */
  }

  const normalized = {
    ...project,
    auditor_customers: custSingle ? { ...custSingle, auditor_leads: leadSingle } : null,
  }

  return (
    <AuditorProjectDetailClient
      project={normalized}
      scans={scans || []}
      notes={notes as { id: string; content: string; created_at: string }[]}
      tasks={tasks as { id: string; title: string; description: string | null; status: string; due_date: string | null; created_at: string }[]}
    />
  )
}
