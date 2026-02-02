import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAllDocumentsListAction } from "../../actions"
import type { DocumentsListFilters } from "@/lib/documents/types"
import DraftsListClient from "../../drafts/DraftsListClient"

type PageProps = {
  searchParams: Promise<{
    search?: string
    page?: string
  }>
}

const ONGOING_DOC_TYPES = "quote,proforma,work_order,delivery_note,return_note,purchase_order,self_invoice,self_credit_note"

export default async function OngoingDocumentDraftsPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const params = await searchParams

  const filters: DocumentsListFilters = {
    search: params.search,
    documentType: ONGOING_DOC_TYPES,
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

