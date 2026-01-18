import { createClient } from "@/lib/supabase/server"
import { AdminDashboard } from "@/components/admin/admin-dashboard"

export default async function AdminPage() {
  const supabase = await createClient()
  
  // Get admin name for header
  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  let adminName = "Admin"
  if (user) {
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("name, email")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    adminName = adminData?.name || adminData?.email || user.email || "Admin"
  }

  // Fetch KPI data
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  // Total users
  const { count: totalUsers } = await supabase.from("companies").select("*", { count: "exact", head: true })

  // New users this month
  const { count: newUsersThisMonth } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfThisMonth.toISOString())

  // New users last month
  const { count: newUsersLastMonth } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfLastMonth.toISOString())
    .lte("created_at", endOfLastMonth.toISOString())

  // Active users count
  const { count: activeUsers } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")

  // Fetch companies with document counts
  const { data: companies } = await supabase
    .from("companies")
    .select(`
      *,
      documents:documents(count)
    `)
    .order("created_at", { ascending: false })

  // Fetch global settings
  const { data: settings } = await supabase.from("global_settings").select("*")

  const kpiData = {
    totalUsers: totalUsers || 0,
    newUsersThisMonth: newUsersThisMonth || 0,
    newUsersLastMonth: newUsersLastMonth || 0,
    activeUsers: activeUsers || 0,
  }

  return (
    <AdminDashboard
      kpiData={kpiData}
      companies={companies || []}
      settings={settings || []}
      adminName={adminName}
    />
  )
}
