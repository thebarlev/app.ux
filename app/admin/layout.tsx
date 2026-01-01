import type React from "react"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AdminLayoutClient from "./AdminLayoutClient"

export const metadata: Metadata = {
  title: "System Admin Panel",
  description: "System Owner Administration Panel",
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/admin/login")
  }

  // Verify user is a system admin
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .single()

  if (!adminData) {
    redirect("/admin/login?error=unauthorized")
  }

  return (
    <AdminLayoutClient adminName={adminData.name || adminData.email}>
      {children}
    </AdminLayoutClient>
  )
}
