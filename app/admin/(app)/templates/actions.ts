"use server"

import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import type { TemplateDefinition } from "@/lib/types/template"
import { revalidatePath } from "next/cache"
import type { DocumentType } from "@/config/documentVariables"

// ==================== FETCH TEMPLATES ====================

/**
 * Get all templates for current user's company + global templates
 * Admins see all templates, regular users see only their company's + global
 */
export async function getTemplatesAction() {
  console.log("🔵 getTemplatesAction called")
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error("❌ No user authenticated")
      return { ok: false as const, message: "משתמש לא מחובר" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData
    console.log("👤 Is admin:", isAdmin)
    
    let query = supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
    
    // Non-admins: filter by company_id
    if (!isAdmin) {
      try {
        const companyId = await getCompanyIdForUser()
        console.log("🏢 Company ID:", companyId)
        query = query.or(`company_id.eq.${companyId},company_id.is.null`)
      } catch (error) {
        console.error("❌ Failed to get company ID:", error)
        return { ok: false as const, message: "לא נמצאה חברה למשתמש" }
      }
    } else {
      console.log("👑 Admin - fetching all templates")
    }

    const { data, error } = await query

    if (error) {
      console.error("❌ DB query failed:", error)
      return { ok: false as const, message: error.message }
    }

    console.log("✅ Found templates:", data?.length || 0)
    return { ok: true as const, templates: data as TemplateDefinition[] }
  } catch (error) {
    console.error("🚨 Caught exception in getTemplatesAction:", error)
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

    const { data: typeRows } = await supabase
      .from("template_document_types")
      .select("document_type")
      .eq("template_id", templateId)

    const documentTypes =
      (typeRows || []).map((row: any) => row.document_type).filter(Boolean)

    return {
      ok: true as const,
      template: data as TemplateDefinition,
      documentTypes,
    }
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
  documentType: DocumentType
  documentTypes?: DocumentType[]
  htmlHe: string
  cssHe?: string
  htmlEn?: string
  cssEn?: string
  thumbnailUrl?: string
  isDefault?: boolean
  isActive?: boolean
}

export async function createTemplateAction(payload: CreateTemplatePayload) {
  console.log("🔵 createTemplateAction called", payload)
  try {
    const supabase = await createClient()
    
    // Validation
    if (!payload.name || payload.name.trim().length < 3) {
      console.error("❌ Validation failed: name too short")
      return { ok: false as const, message: "שם התבנית חייב להכיל לפחות 3 תווים" }
    }

    if (!payload.htmlHe || payload.htmlHe.trim().length < 50) {
      console.error("❌ Validation failed: HTML too short")
      return { ok: false as const, message: "תבנית HTML חייבת להכיל לפחות 50 תווים" }
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error("❌ No user authenticated")
      return { ok: false as const, message: "משתמש לא מחובר" }
    }
    
    console.log("✅ User authenticated:", user.id)
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData
    console.log("👤 Is admin:", isAdmin)
    
    // Get company ID (only for non-admins)
    let companyId: string | null = null
    if (!isAdmin) {
      try {
        companyId = await getCompanyIdForUser()
        console.log("🏢 Company ID:", companyId)
      } catch (error) {
        console.error("❌ Failed to get company ID:", error)
        return { ok: false as const, message: "לא נמצאה חברה למשתמש" }
      }
    } else {
      console.log("👑 Admin creating global template (no company_id)")
    }

    // If setting as default, unset other defaults for this document type
    if (payload.isDefault) {
      if (companyId) {
        console.log("📝 Unsetting other defaults for company:", companyId)
        await supabase
          .from("templates")
          .update({ is_default: false })
          .eq("company_id", companyId)
          .eq("document_type", payload.documentType)
      } else {
        // Admin creating global template - unset global defaults
        console.log("📝 Unsetting other global defaults for document_type:", payload.documentType)
        await supabase
          .from("templates")
          .update({ is_default: false })
          .is("company_id", null)
          .eq("document_type", payload.documentType)
      }
    }

    // Create template
    console.log("💾 Inserting template to DB...")
    const { data, error } = await supabase
      .from("templates")
      .insert({
        company_id: companyId, // null for admins, UUID for regular users
        name: payload.name,
        description: payload.description || null,
        document_type: payload.documentType,
        html_template: payload.htmlHe,
        css: payload.cssHe || null,
        html_en: payload.htmlEn || null,
        css_en: payload.cssEn || null,
        thumbnail_url: payload.thumbnailUrl || null,
        is_default: payload.isDefault || false,
        is_active: payload.isActive !== false,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) {
      console.error("❌ DB insert failed:", error)
      return { ok: false as const, message: error.message }
    }
    
    console.log("✅ Template created successfully:", data.id)

    // Save multi-document type associations (junction table)
    const requestedTypes =
      payload.documentTypes && payload.documentTypes.length > 0
        ? payload.documentTypes
        : [payload.documentType]
    const uniqueTypes = Array.from(new Set(requestedTypes))
    const { error: mappingError } = await supabase
      .from("template_document_types")
      .upsert(
        uniqueTypes.map((documentType) => ({
          template_id: data.id,
          document_type: documentType,
        })),
        { onConflict: "template_id,document_type" }
      )

    if (mappingError) {
      console.error("❌ Failed to save template document types:", mappingError)
      return { ok: false as const, message: mappingError.message }
    }

    console.log("🔄 Revalidating path...")
    revalidatePath("/admin/templates")
    console.log("🎉 Action completed successfully")
    return { ok: true as const, templateId: data.id }
  } catch (error) {
    console.error("🚨 Caught exception in createTemplateAction:", error)
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

    if (!payload.htmlHe || payload.htmlHe.trim().length < 50) {
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

    // Allow editing global templates (company_id = null) for admins
    // Allow editing company templates only if they belong to the user's company
    if (existing.company_id !== null && existing.company_id !== companyId) {
      return { ok: false as const, message: "אין הרשאה לערוך תבנית זו" }
    }

    // If setting as default, unset other defaults
    if (payload.isDefault) {
      if (existing.company_id === null) {
        await supabase
          .from("templates")
          .update({ is_default: false })
          .is("company_id", null)
          .eq("document_type", payload.documentType)
          .neq("id", payload.id)
      } else {
        await supabase
          .from("templates")
          .update({ is_default: false })
          .eq("company_id", companyId)
          .eq("document_type", payload.documentType)
          .neq("id", payload.id)
      }
    }

    // Update template
    const { error } = await supabase
      .from("templates")
      .update({
        name: payload.name,
        description: payload.description || null,
        document_type: payload.documentType,
        html_template: payload.htmlHe,
        css: payload.cssHe || null,
        html_en: payload.htmlEn || null,
        css_en: payload.cssEn || null,
        thumbnail_url: payload.thumbnailUrl || null,
        is_default: payload.isDefault || false,
        is_active: payload.isActive !== false,
      })
      .eq("id", payload.id)

    if (error) {
      return { ok: false as const, message: error.message }
    }

    const requestedTypes =
      payload.documentTypes && payload.documentTypes.length > 0
        ? payload.documentTypes
        : [payload.documentType]
    const uniqueTypes = Array.from(new Set(requestedTypes))

    const { error: deleteError } = await supabase
      .from("template_document_types")
      .delete()
      .eq("template_id", payload.id)

    if (deleteError) {
      return { ok: false as const, message: deleteError.message }
    }

    const { error: insertError } = await supabase
      .from("template_document_types")
      .insert(
        uniqueTypes.map((documentType) => ({
          template_id: payload.id,
          document_type: documentType,
        }))
      )

    if (insertError) {
      return { ok: false as const, message: insertError.message }
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
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData

    // Verify ownership
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()

    if (!existing) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    // Allow admins to delete global templates
    if (existing.company_id === null && !isAdmin) {
      return { ok: false as const, message: "לא ניתן למחוק תבניות גלובליות" }
    }

    // For non-global templates, verify company ownership
    if (existing.company_id !== null && !isAdmin) {
      const companyId = await getCompanyIdForUser()
      if (existing.company_id !== companyId) {
        return { ok: false as const, message: "אין הרשאה למחוק תבנית זו" }
      }
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
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }

    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    const isAdmin = !!adminData

    // Company ID is only required for non-admin users
    const companyId = isAdmin ? null : await getCompanyIdForUser()

    // Get original template
    let originalQuery = supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
    
    // Non-admins can only duplicate their company templates + global templates
    if (!isAdmin && companyId) {
      originalQuery = originalQuery.or(`company_id.eq.${companyId},company_id.is.null`)
    }

    const { data: original, error: fetchError } = await originalQuery.single()

    if (fetchError || !original) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    // Destination scope:
    // - Admin: preserve the original scope (global stays global; company stays with that company_id)
    // - Non-admin: always duplicate into the user's company
    const destinationCompanyId: string | null = isAdmin ? (original.company_id ?? null) : companyId

    // Create duplicate
    const { data, error } = await supabase
      .from("templates")
      .insert({
        company_id: destinationCompanyId,
        name: `${original.name} (עותק)`,
        description: original.description,
        document_type: original.document_type,
        html_template: (original as any).html_template || null,
        css: (original as any).css || null,
        html_en: (original as any).html_en || null,
        css_en: (original as any).css_en || null,
        thumbnail_url: (original as any).thumbnail_url || null,
        // Legacy fields intentionally not copied as source of truth.
        is_default: false, // Never set duplicate as default
        is_active: (original as any).is_active !== false,
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
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData

    // Verify ownership
    const { data: existing } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()

    if (!existing) {
      return { ok: false as const, message: "תבנית לא נמצאה" }
    }

    // Allow admins to toggle global templates
    if (existing.company_id === null && !isAdmin) {
      return { ok: false as const, message: "לא ניתן לשנות סטטוס של תבניות גלובליות" }
    }

    // For non-global templates, verify company ownership
    if (existing.company_id !== null && !isAdmin) {
      const companyId = await getCompanyIdForUser()
      if (existing.company_id !== companyId) {
        return { ok: false as const, message: "אין הרשאה לשנות תבנית זו" }
      }
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

// ==================== THUMBNAIL UPLOAD ====================

/**
 * Upload thumbnail image for a template
 * @param templateId - ID of the template to upload thumbnail for
 * @param file - Image file (PNG, JPG, WebP, max 2MB)
 */
export async function uploadTemplateThumbnailAction(
  templateId: string,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const supabase = await createClient()
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return { 
        ok: false, 
        message: "פורמט קובץ לא נתמך. השתמש ב-PNG, JPG או WebP" 
      }
    }
    
    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      return { 
        ok: false, 
        message: "גודל הקובץ חורג מ-2MB" 
      }
    }
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, message: "משתמש לא מחובר" }
    }
    
    // Verify template exists and get ownership
    const { data: template, error: fetchError } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()
    
    if (fetchError || !template) {
      return { ok: false, message: "תבנית לא נמצאה" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData
    
    // Verify permissions (admin can upload to any template, users only to their company's)
    if (!isAdmin && template.company_id !== null) {
      try {
        const companyId = await getCompanyIdForUser()
        if (template.company_id !== companyId) {
          return { ok: false, message: "אין הרשאה לערוך תבנית זו" }
        }
      } catch (error) {
        return { ok: false, message: "לא נמצאה חברה למשתמש" }
      }
    }
    
    // Delete old thumbnail if exists
    const oldPath = `template-thumbnails/${templateId}/thumbnail.png`
    await supabase.storage.from("business-assets").remove([oldPath])
    
    // Upload new thumbnail
    const filePath = `template-thumbnails/${templateId}/thumbnail.png`
    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      })
    
    if (uploadError) {
      return { ok: false, message: uploadError.message }
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("business-assets")
      .getPublicUrl(filePath)
    
    // Update template with thumbnail URL
    const { error: updateError } = await supabase
      .from("templates")
      .update({ thumbnail_url: publicUrl })
      .eq("id", templateId)
    
    if (updateError) {
      return { ok: false, message: updateError.message }
    }
    
    revalidatePath("/admin/templates")
    return { ok: true, url: publicUrl }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה בהעלאת תמונה"
    }
  }
}

/**
 * Delete thumbnail image for a template
 * @param templateId - ID of the template to delete thumbnail from
 */
export async function deleteTemplateThumbnailAction(
  templateId: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, message: "משתמש לא מחובר" }
    }
    
    // Verify template exists and get ownership
    const { data: template } = await supabase
      .from("templates")
      .select("id, company_id")
      .eq("id", templateId)
      .single()
    
    if (!template) {
      return { ok: false, message: "תבנית לא נמצאה" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData
    
    // Verify permissions
    if (!isAdmin && template.company_id !== null) {
      try {
        const companyId = await getCompanyIdForUser()
        if (template.company_id !== companyId) {
          return { ok: false, message: "אין הרשאה לערוך תבנית זו" }
        }
      } catch (error) {
        return { ok: false, message: "לא נמצאה חברה למשתמש" }
      }
    }
    
    // Delete from storage
    const filePath = `template-thumbnails/${templateId}/thumbnail.png`
    await supabase.storage.from("business-assets").remove([filePath])
    
    // Update template (set thumbnail_url to null)
    const { error: updateError } = await supabase
      .from("templates")
      .update({ thumbnail_url: null })
      .eq("id", templateId)
    
    if (updateError) {
      return { ok: false, message: updateError.message }
    }
    
    revalidatePath("/admin/templates")
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "שגיאה במחיקת תמונה"
    }
  }
}
