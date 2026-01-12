"use server"

import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { revalidatePath } from "next/cache"
import type { DocumentType } from "@/config/documentVariables"

// ==================== TYPES ====================

export type TemplateSelection = {
  id: string
  company_id: string
  document_type: DocumentType
  template_id: string
  selected_at: string
  updated_at: string
}

export type TemplateWithSelection = {
  id: string
  name: string
  description: string | null
  document_type: DocumentType
  thumbnail_url: string | null
  is_default: boolean
  is_active: boolean
  company_id: string | null
  is_selected?: boolean // Computed field
}

// ==================== GET SELECTIONS ====================

/**
 * Get all template selections for current company
 * Returns map of document_type → template_id
 */
export async function getTemplateSelectionsAction(): Promise<
  | { ok: true; selections: Record<string, string> }
  | { ok: false; message: string }
> {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    const { data, error } = await supabase
      .from("company_template_selections")
      .select("document_type, template_id")
      .eq("company_id", companyId)

    if (error) {
      return { ok: false, message: error.message }
    }

    // Convert to map for easy lookup
    const selections: Record<string, string> = {}
    data?.forEach((row) => {
      selections[row.document_type] = row.template_id
    })

    return { ok: true, selections }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה בטעינת בחירות תבניות",
    }
  }
}

// ==================== GET TEMPLATES BY TYPE ====================

/**
 * Get available templates for a specific document type
 * Includes company templates + global templates
 * Marks selected template with is_selected flag
 */
export async function getTemplatesForDocumentTypeAction(
  documentType: DocumentType
): Promise<
  | { ok: true; templates: TemplateWithSelection[] }
  | { ok: false; message: string }
> {
  const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
  try {
    const supabase = await createClient()
    
    // Get company ID - if user has no company, they can still see global templates
    let companyId: string | null = null
    try {
      companyId = await getCompanyIdForUser()
    } catch (error) {
      // User might not have a company - they can still see global templates
      if (DEBUG_TEMPLATES) {
        console.log("[TEMPLATE_FETCH] No company for user, loading global templates only")
      }
    }

    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] getTemplatesForDocumentTypeAction - documentType:", documentType)
      console.log("[TEMPLATE_FETCH] companyId:", companyId)
    }

    // Get available templates
    let query = supabase
      .from("templates")
      .select("id, name, description, document_type, thumbnail_url, is_default, is_active, company_id")
      .eq("document_type", documentType)
      .eq("is_active", true)

    if (companyId) {
      query = query.or(`company_id.eq.${companyId},company_id.is.null`)
    } else {
      // Only global templates if user has no company
      query = query.is("company_id", null)
    }

    const { data: templates, error: templatesError } = await query
      .order("is_default", { ascending: false })
      .order("company_id", { ascending: true }) // Company templates first
      .order("name")

    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] Query result:", { count: templates?.length || 0, error: templatesError?.message })
    }

    if (templatesError) {
      return { ok: false, message: templatesError.message }
    }

    // Get current selection (only if user has a company)
    let selection = null
    if (companyId) {
      const { data: selectionData } = await supabase
        .from("company_template_selections")
        .select("template_id")
        .eq("company_id", companyId)
        .eq("document_type", documentType)
        .maybeSingle()
      selection = selectionData
    }

    // Mark selected template
    const templatesWithSelection = (templates || []).map((t) => ({
      ...t,
      is_selected: t.id === selection?.template_id,
    }))

    return { ok: true, templates: templatesWithSelection }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה בטעינת תבניות",
    }
  }
}

// ==================== SAVE SELECTION ====================

/**
 * Save/update template selection for a document type
 * Replaces existing selection (UPSERT behavior)
 */
export async function saveTemplateSelectionAction(
  documentType: DocumentType,
  templateId: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Verify template exists and is available to this company
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("id, company_id, is_active")
      .eq("id", templateId)
      .single()

    if (templateError || !template) {
      return { ok: false, message: "תבנית לא נמצאה" }
    }

    if (!template.is_active) {
      return { ok: false, message: "תבנית לא פעילה" }
    }

    // Verify user has access to this template
    if (template.company_id !== null && template.company_id !== companyId) {
      return { ok: false, message: "אין הרשאה לבחור תבנית זו" }
    }

    // Upsert selection (INSERT or UPDATE if exists)
    const { error: upsertError } = await supabase
      .from("company_template_selections")
      .upsert(
        {
          company_id: companyId,
          document_type: documentType,
          template_id: templateId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,document_type", // Update if exists
        }
      )

    if (upsertError) {
      return { ok: false, message: upsertError.message }
    }

    revalidatePath("/dashboard/settings")
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה בשמירת בחירה",
    }
  }
}

// ==================== REMOVE SELECTION ====================

/**
 * Remove template selection for a document type
 * System will fall back to default template
 */
export async function removeTemplateSelectionAction(
  documentType: DocumentType
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    const { error } = await supabase
      .from("company_template_selections")
      .delete()
      .eq("company_id", companyId)
      .eq("document_type", documentType)

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/dashboard/settings")
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה במחיקת בחירה",
    }
  }
}
