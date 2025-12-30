import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { redirect } from "next/navigation";
import CustomerDocumentsClient from "./CustomerDocumentsClient";

export default async function CustomerDocumentsPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = await getCompanyIdForUser();
  const customerId = params.id;

  // Fetch customer details
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .single();

  if (customerError || !customer) {
    redirect("/dashboard/customers");
  }

  // Fetch all documents for this customer
  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", customerId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return (
    <CustomerDocumentsClient
      customer={customer}
      initialDocuments={documents || []}
    />
  );
}
