import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllDocumentsListAction } from "./actions";
import type { DocumentsListFilters } from "@/lib/documents/types";
import DocumentsListClient from "./DocumentsListClient";

type PageProps = {
  searchParams: Promise<{
    search?: string;
    documentType?: string;
    page?: string;
  }>;
};

export default async function DocumentsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  
  // Authenticate user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  
  // Parse filters from URL params
  const filters: DocumentsListFilters = {
    search: params.search,
    documentType: params.documentType || "all",
    documentStatusFilter: "nonDraft",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  };

  // Fetch documents
  const result = await getAllDocumentsListAction(filters);

  return (
    <main dir="rtl" className="min-h-screen" >
      <DocumentsListClient initialData={result} initialFilters={filters} />
    </main>
  );
}
