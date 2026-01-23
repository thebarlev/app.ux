"use client"

import { AdminDashboardLayout } from "@/components/layout/AdminDashboardLayout"

interface AdminLayoutClientProps {
  adminName: string
  children: React.ReactNode
}

export default function AdminLayoutClient({ adminName, children }: AdminLayoutClientProps) {
  return (
    <AdminDashboardLayout adminName={adminName}>
      {children}
    </AdminDashboardLayout>
  )
}
