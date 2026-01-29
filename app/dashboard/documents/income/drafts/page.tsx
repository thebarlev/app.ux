import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAllDocumentsListAction, type DocumentsListFilters } from "../../actions"
import DraftsListClient from "../../drafts/DraftsListClient"

type PageProps = {
  searchParams: Promise<{
    search?: string
    page?: string
  }>
}

const INCOME_DOC_TYPES = "receipt,tax_invoice,invoice_receipt,credit_note"

export default async function IncomeDocumentDraftsPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const params = await searchParams

  const filters: DocumentsListFilters = {
    search: params.search,
    documentType: INCOME_DOC_TYPES,
    documentStatusFilter: "draft",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  }

  const result = await getAllDocumentsListAction(filters)

  return (
    <main dir="rtl" className="min-h-screen">
      <DraftsListClient initialData={result} initialFilters={filters} />
    </main>
  )
}

