import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { CompanyDetails } from "@/components/admin/company-details"

interface Props {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

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

  // Fetch company details
  const { data: company, error: companyError } = await supabase.from("companies").select("*").eq("id", id).single()

  if (companyError || !company) {
    notFound()
  }

  // Fetch company documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("company_id", id)
    .order("issue_date", { ascending: false })

  // Calculate total revenue (only tax invoices and invoice receipts)
  const totalRevenue =
    documents
      ?.filter((d) => ["tax_invoice", "invoice_receipt"].includes(d.document_type) && d.status !== "canceled")
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0

  return (
    <CompanyDetails
      company={company}
      documents={documents || []}
      totalRevenue={totalRevenue}
      adminName={adminData.name || adminData.email}
    />
  )
}
