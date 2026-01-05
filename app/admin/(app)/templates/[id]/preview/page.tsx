import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import TemplatePreviewClient from "./TemplatePreviewClient"

export default async function AdminTemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Verify admin access
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/admin/login")
  }

  // Verify system admin
  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!adminData) {
    redirect("/admin/login")
  }

  // Fetch template
  const { data: template, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !template) {
    redirect("/admin/templates")
  }

  return <TemplatePreviewClient template={template} />
}
