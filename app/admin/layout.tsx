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

  // The middleware already handles authentication and authorization
  // If we're here, the user is authenticated and is an admin
  // Just fetch the admin data for display purposes
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id, name, email")
    .eq("auth_user_id", user?.id)
    .single()

  const adminName = adminData?.name || adminData?.email || user?.email || "Admin"

  return (
    <AdminLayoutClient adminName={adminName}>
      {children}
    </AdminLayoutClient>
  )
}
