import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import DocumentVariablesClient from "./DocumentVariablesClient"

export const metadata = {
  title: "משתני מסמכים | אדמין",
}

export default async function DocumentVariablesPage() {
  const supabase = await createClient()

  // Verify admin authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/admin/login")
  }

  // Verify admin role
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (!adminData) {
    redirect("/admin/login")
  }

  return <DocumentVariablesClient />
}
