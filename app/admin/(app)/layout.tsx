import type React from "react"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AdminLayoutClient from "./AdminLayoutClient"

export const metadata: Metadata = {
  title: "System Admin Panel",
  description: "System Owner Administration Panel",
}

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Guard: User must be authenticated
  if (!user) {
    redirect("/admin/login")
  }

  // Guard: User must be a system admin
  const { data: adminData, error } = await supabase
    .from("system_admins")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .single()

  // If not an admin, redirect to dashboard with error
  if (error || !adminData) {
    redirect("/dashboard?error=unauthorized")
  }

  const adminName = adminData.name || adminData.email || user.email || "Admin"

  return (
    <AdminLayoutClient adminName={adminName}>
      {children}
    </AdminLayoutClient>
  )
}
