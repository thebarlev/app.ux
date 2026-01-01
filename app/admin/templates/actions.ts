"use server"

import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import type { TemplateDefinition } from "@/lib/types/template"
import { revalidatePath } from "next/cache"

// ==================== FETCH TEMPLATES ====================

/**
 * Get all templates for current user's company + global templates
 */
export async function getTemplatesAction() {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("created_at", { ascending: false })

    if (error) {
      return { ok: false as const, message: error.message }
    }

    return { ok: true as const, templates: data as TemplateDefinition[] }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בטעינת תבניות",
    }
  }
}

/**
 * Get single template by ID
 */
export async function getTemplateByIdAction(templateId: string) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .single()

    if (error) {
      return { ok: false as const, message: error.message }
    }

    return { ok: true as const, template: data as TemplateDefinition }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בטעינת תבנית",
    }
  }
}

// ==================== CREATE TEMPLATE ====================

export type CreateTemplatePayload = {
  name: string
  description?: string
  documentType: "receipt" | "invoice" | "quote" | "delivery_note"
  htmlTemplate: string
  css?: string
  thumbnailUrl?: string
  isDefault?: boolean
  isActive?: boolean
}

export async function createTemplateAction(payload: CreateTemplatePayload) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Validation
    if (!payload.name || payload.name.trim().length < 3) {
      return { ok: false as const, message: "שם התבנית חייב להכיל לפחות 3 תווים" }
    }

    if (!payload.htmlTemplate || payload.htmlTemplate.trim().length < 50) {
      return { ok: false as const, message: "תבנית HTML חייבת להכיל לפחות 50 תווים" }
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }

    // If setting as default, unset other defaults for this document type
    if (payload.isDefault) {
      await supabase
        .from("templates")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .eq("document_type", payload.documentType)
    }

    // Create template
    const { data, error } = await supabase
      .from("templates")
      .insert({
        company_id: companyId,
        name: payload.name,
        description: payload.description || null,
        document_type: payload.documentType,
        html_template: payload.htmlTemplate,
        css: payload.css || null,
        thumbnail_url: payload.thumbnailUrl || null,
        is_default: payload.isDefault || false,
        is_active: payload.isActive !== false,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    return { ok: true as const, templateId: data.id }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה ביצירת תבנית",
    }
  }
}

// ==================== UPDATE TEMPLATE ====================

export type UpdateTemplatePayload = CreateTemplatePayload & {
  id: string
}

export async function updateTemplateAction(payload: UpdateTemplatePayload) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Validation
    if (!payload.name || payload.name.trim().length < 3) {
      return { ok: false as const, message: "שם התבנית חייב להכיל לפחות 3 תווים" }
    }

    if (!payload.htmlTemplate || payload.htmlTemplate.trim().length < 50) {
      return { ok: false as const, message: "תבנית HTML חייבת להכיל לפחות 50 תווים" }
    }

    // Verify ownership (only company templates can be updated)
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", payload.id)
      .single()

    if (!existing) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    if (existing.company_id === null) {
      return { ok: false as const, message: "לא ניתן לערוך תבניות גלובליות" }
    }

    if (existing.company_id !== companyId) {
      return { ok: false as const, message: "אין הרשאה לערוך תבנית זו" }
    }

    // If setting as default, unset other defaults
    if (payload.isDefault) {
      await supabase
        .from("templates")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .eq("document_type", payload.documentType)
        .neq("id", payload.id)
    }

    // Update template
    const { error } = await supabase
      .from("templates")
      .update({
        name: payload.name,
        description: payload.description || null,
        document_type: payload.documentType,
        html_template: payload.htmlTemplate,
        css: payload.css || null,
        thumbnail_url: payload.thumbnailUrl || null,
        is_default: payload.isDefault || false,
        is_active: payload.isActive !== false,
      })
      .eq("id", payload.id)

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    revalidatePath(`/admin/templates/${payload.id}`)
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בעדכון תבנית",
    }
  }
}

// ==================== DELETE TEMPLATE ====================

export async function deleteTemplateAction(templateId: string) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Verify ownership
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()

    if (!existing) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    if (existing.company_id === null) {
      return { ok: false as const, message: "לא ניתן למחוק תבניות גלובליות" }
    }

    if (existing.company_id !== companyId) {
      return { ok: false as const, message: "אין הרשאה למחוק תבנית זו" }
    }

    // Delete
    const { error } = await supabase
      .from("templates")
      .delete()
      .eq("id", templateId)

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה במחיקת תבנית",
    }
  }
}

// ==================== DUPLICATE TEMPLATE ====================

export async function duplicateTemplateAction(templateId: string) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Get original template
    const { data: original, error: fetchError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .single()

    if (fetchError || !original) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }

    // Create duplicate (always for current company, never global)
    const { data, error } = await supabase
      .from("templates")
      .insert({
        company_id: companyId,
        name: `${original.name} (עותק)`,
        description: original.description,
        document_type: original.document_type,
        html_template: original.html_template,
        css: original.css,
        is_default: false, // Never set duplicate as default
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    return { ok: true as const, templateId: data.id }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בשכפול תבנית",
    }
  }
}

// ==================== TOGGLE TEMPLATE STATUS ====================

export async function toggleTemplateActiveAction(templateId: string, isActive: boolean) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Verify ownership
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()

    if (!existing) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    if (existing.company_id === null) {
      return { ok: false as const, message: "לא ניתן לשנות סטטוס של תבניות גלובליות" }
    }

    if (existing.company_id !== companyId) {
      return { ok: false as const, message: "אין הרשאה לשנות תבנית זו" }
    }

    const { error } = await supabase
      .from("templates")
      .update({ is_active: isActive })
      .eq("id", templateId)

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בשינוי סטטוס",
    }
  }
}

export async function setTemplateAsDefaultAction(templateId: string, documentType: string) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyIdForUser()

    // Verify ownership
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()

    if (!existing || existing.company_id !== companyId) {
      return { ok: false as const, message: "אין הרשאה לשנות תבנית זו" }
    }

    // Unset other defaults
    await supabase
      .from("templates")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("document_type", documentType)

    // Set as default
    const { error } = await supabase
      .from("templates")
      .update({ is_default: true })
      .eq("id", templateId)

    if (error) {
      return { ok: false as const, message: error.message }
    }

    revalidatePath("/admin/templates")
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בהגדרת ברירת מחדל",
    }
  }
}
