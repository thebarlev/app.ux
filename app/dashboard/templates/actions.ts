"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

/**
 * Get active templates available for selection (company-specific or global)
 */
export async function getAvailableTemplatesAction() {
  const supabase = await createClient()

  // Get current user's company
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: "לא מחובר", templates: [] }
  }

  // Get company_id from company_members
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership?.company_id) {
    // Try direct ownership
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (!company) {
      return { ok: false, message: "לא נמצאה חברה", templates: [] }
    }
    membership.company_id = company.id
  }

  const companyId = membership.company_id

  // Get active templates (company-specific OR global)
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id, name, description, document_type, thumbnail_url, is_default, company_id")
    .eq("is_active", true)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .eq("document_type", "receipt") // For now, only receipts
    .order("is_default", { ascending: false })
    .order("name")

  if (error) {
    return { ok: false, message: error.message, templates: [] }
  }

  return { ok: true, templates: templates || [] }
}

/**
 * Get currently selected template for user's company
 */
export async function getSelectedTemplateAction() {
  const supabase = await createClient()

  // Get current user's company
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: "לא מחובר", templateId: null }
  }

  // Get company_id from company_members
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership?.company_id) {
    // Try direct ownership
    const { data: company } = await supabase
      .from("companies")
      .select("id, selected_template_id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (!company) {
      return { ok: false, message: "לא נמצאה חברה", templateId: null }
    }
    return { ok: true, templateId: company.selected_template_id }
  }

  const companyId = membership.company_id

  // Get company's selected template
  const { data: company, error } = await supabase
    .from("companies")
    .select("selected_template_id")
    .eq("id", companyId)
    .single()

  if (error) {
    return { ok: false, message: error.message, templateId: null }
  }

  return { ok: true, templateId: company.selected_template_id }
}

/**
 * Set selected template for user's company
 */
export async function setSelectedTemplateAction(templateId: string) {
  const supabase = await createClient()

  // Get current user's company
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: "לא מחובר" }
  }

  // Get company_id from company_members
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle()

  let companyId: string | null = null

  if (!membership?.company_id) {
    // Try direct ownership
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (!company) {
      return { ok: false, message: "לא נמצאה חברה" }
    }
    companyId = company.id
  } else {
    companyId = membership.company_id
  }

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

  revalidatePath("/dashboard/templates")
  revalidatePath("/dashboard/documents")

  return { ok: true }
}
