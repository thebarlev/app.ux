import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { CompanyDetails } from "@/components/admin/company-details"
import type { AuditorSubscriptionSummary } from "@/lib/types/admin"

interface Props {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const adminDb = createServiceRoleClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/admin/login")
  }

  // Verify user is a system admin
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .single()

  if (!adminData) {
    redirect("/admin/login?error=unauthorized")
  }

  // Fetch company details with admin privileges so all admin-listed companies are viewable here too.
  const { data: company, error: companyError } = await adminDb.from("companies").select("*").eq("id", id).single()

  if (companyError || !company) {
    notFound()
  }

  // Fetch company documents
  const { data: documents } = await adminDb
    .from("documents")
    .select("*")
    .eq("company_id", id)
    .order("issue_date", { ascending: false })

  const { data: intakeRows } = await adminDb
    .from("auditor_client_intake")
    .select("*")
    .eq("company_id", id)
    .order("created_at", { ascending: false })
    .limit(1)

  const intake = Array.isArray(intakeRows) && intakeRows.length > 0 ? intakeRows[0] : null

  const [{ data: subscription }, { data: charges }] = await Promise.all([
    adminDb
      .from("auditor_subscriptions")
      .select("plan_id, status, next_billing_date, current_period_end")
      .eq("company_id", id)
      .maybeSingle(),
    adminDb
      .from("auditor_subscription_charges")
      .select("created_at, status")
      .eq("company_id", id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false }),
  ])

  const succeededCharges = charges ?? []
  const subscriptionSummary: AuditorSubscriptionSummary = {
    plan_id: typeof (subscription as any)?.plan_id === "string" ? (subscription as any).plan_id : null,
    status: typeof (subscription as any)?.status === "string" ? (subscription as any).status : null,
    next_billing_date: (subscription as any)?.next_billing_date ? String((subscription as any).next_billing_date) : null,
    current_period_end: (subscription as any)?.current_period_end ? String((subscription as any).current_period_end) : null,
    last_payment_at: succeededCharges[0]?.created_at ? String(succeededCharges[0].created_at) : null,
    successful_payments_count: succeededCharges.length,
    is_active: String((subscription as any)?.status || "") === "active",
  }

  // Calculate total revenue (only tax invoices and invoice receipts)
  const totalRevenue =
    documents
      ?.filter((d) => ["tax_invoice", "invoice_receipt"].includes(d.document_type) && d.status !== "canceled")
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0

  return (
    <CompanyDetails
      company={company}
      intake={intake}
      subscription={subscriptionSummary}
      documents={documents || []}
      totalRevenue={totalRevenue}
      adminName={adminData.name || adminData.email}
    />
  )
}
