import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAvailableTemplatesAction, getSelectedTemplateAction } from "./actions"
import TemplateSelectionClient from "./TemplateSelectionClient"

export const metadata = {
  title: "בחירת תבנית | מסמכים",
}

export default async function TemplateSelectionPage() {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get available templates
  const templatesResult = await getAvailableTemplatesAction()
  const selectedResult = await getSelectedTemplateAction()

  return (
    <TemplateSelectionClient
      initialTemplates={templatesResult.templates || []}
      initialSelectedId={selectedResult.templateId || null}
    />
  )
}
