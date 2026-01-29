import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAllDocumentsListAction, type DocumentsListFilters } from "../actions"
import DocumentsListClient from "../DocumentsListClient"

type PageProps = {
  searchParams: Promise<{
    search?: string
    page?: string
  }>
}

const INCOME_DOC_TYPES = "receipt,tax_invoice,invoice_receipt,credit_note"

export default async function IncomeDocumentsPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const params = await searchParams

  const filters: DocumentsListFilters = {
    search: params.search,
    documentType: INCOME_DOC_TYPES,
    documentStatusFilter: "nonDraft",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  }

  const result = await getAllDocumentsListAction(filters)

  return (
    <main dir="rtl" className="min-h-screen">
      <DocumentsListClient
        initialData={result}
        initialFilters={filters}
        listPathBase="/dashboard/documents/income"
        pageTitle="הכנסות"
      />
    </main>
  )
}

