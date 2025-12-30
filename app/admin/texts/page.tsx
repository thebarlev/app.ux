import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TextsManagementClient } from "./TextsManagementClient";

export const metadata = {
  title: "System Texts Management | Admin",
  description: "Manage all system text strings",
};

export default async function AdminTextsPage() {
  const supabase = await createClient();

  // Verify authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  // Verify admin role
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminData) {
    redirect("/admin/login");
  }

  return <TextsManagementClient adminEmail={adminData.email || user.email || "Admin"} />;
}
