import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import ManageAuthClient from "./ManageAuthClient"

export const metadata = {
  title: "Manage Auth | Admin",
}

export default async function AdminManageAuthPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/admin/login")
  }

  // Same guard logic as /admin/texts
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!adminData) {
    redirect("/admin/login")
  }

  return <ManageAuthClient currentEmail={adminData.email || user.email || ""} />
}

