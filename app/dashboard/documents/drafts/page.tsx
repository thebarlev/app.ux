import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllDocumentsListAction, type DocumentsListFilters } from "../actions";
import DraftsListClient from "./DraftsListClient";

type PageProps = {
  searchParams: Promise<{
    search?: string;
    documentType?: string;
    page?: string;
  }>;
};

export default async function DocumentDraftsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  const filters: DocumentsListFilters = {
    search: params.search,
    documentType: params.documentType || "all",
    documentStatusFilter: "draft",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  };

  const result = await getAllDocumentsListAction(filters);

  return (
    <main dir="rtl" className="min-h-screen">
      <DraftsListClient initialData={result} initialFilters={filters} />
    </main>
  );
}

