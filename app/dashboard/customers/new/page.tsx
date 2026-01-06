import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerFormClient from "../CustomerFormClient";

export default async function NewCustomerPage() {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return <CustomerFormClient />;
}
