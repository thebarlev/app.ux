import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import CustomerFormClient from "../CustomerFormClient";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = await getCompanyIdForUser();

  // Fetch customer
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", params.id)
    .eq("company_id", companyId)
    .single();

  if (error || !customer) {
    redirect("/dashboard/customers");
  }

  return <CustomerFormClient customer={customer} />;
}
