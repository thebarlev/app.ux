import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import CustomersListClient from "./CustomersListClient";

export default async function CustomersPage() {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get company ID
  const companyId = await getCompanyIdForUser();

  // Fetch customers
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  return <CustomersListClient initialCustomers={customers || []} />;
}
