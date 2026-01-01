"use server"

import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { revalidatePath } from "next/cache"

/**
 * Set selected template for user's company
 */
export async function setSelectedTemplateInSettingsAction(templateId: string) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Verify template exists and is active
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("id, is_active, company_id")
      .eq("id", templateId)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .single()

    if (templateError || !template) {
      return { ok: false, message: "תבנית לא נמצאה" }
    }

    if (!template.is_active) {
      return { ok: false, message: "תבנית זו אינה פעילה" }
    }

    // Update company's selected template
    const { error: updateError } = await supabase
      .from("companies")
      .update({ selected_template_id: templateId })
      .eq("id", companyId)

    if (updateError) {
      return { ok: false, message: updateError.message }
    }

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/documents")

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה בעדכון תבנית",
    }
  }
}
