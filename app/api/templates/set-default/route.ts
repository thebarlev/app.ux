import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("🟢 [API /set-default] Received request")
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error("❌ [API /set-default] No user authenticated")
      return NextResponse.json(
        { ok: false, message: "משתמש לא מחובר" },
        { status: 401 }
      )
    }

    console.log("🟢 [API /set-default] User:", user.email)

    // Parse body
    const body = await request.json()
    const { templateId, isDefault } = body

    console.log("🟢 [API /set-default] Request body:", { templateId: templateId?.substring(0, 8), isDefault })

    if (!templateId || typeof isDefault !== 'boolean') {
      console.error("❌ [API /set-default] Invalid body")
      return NextResponse.json(
        { ok: false, message: "נתונים לא תקינים" },
        { status: 400 }
      )
    }

    // Get company ID
    let companyId: string | null = null
    try {
      companyId = await getCompanyIdForUser()
      console.log("🟢 [API /set-default] Company ID:", companyId?.substring(0, 8))
    } catch (error) {
      console.error("❌ [API /set-default] No company for user")
      return NextResponse.json(
        { ok: false, message: "לא נמצאה חברה למשתמש" },
        { status: 400 }
      )
    }

    // Get the template to check ownership and document_type
    const { data: template, error: fetchError } = await supabase
      .from("templates")
      .select("id, company_id, document_type, name")
      .eq("id", templateId)
      .single()

    if (fetchError || !template) {
      console.error("❌ [API /set-default] Template not found:", fetchError)
      return NextResponse.json(
        { ok: false, message: "תבנית לא נמצאה" },
        { status: 404 }
      )
    }

    console.log("🟢 [API /set-default] Template found:", {
      name: template.name,
      documentType: template.document_type,
      companyId: template.company_id ? 'company' : 'global'
    })

    // Verify user has access (own template or global)
    if (template.company_id !== null && template.company_id !== companyId) {
      console.error("❌ [API /set-default] Access denied: template belongs to different company")
      return NextResponse.json(
        { ok: false, message: "אין הרשאה לעדכן תבנית זו" },
        { status: 403 }
      )
    }

    if (isDefault) {
      console.log("🟢 [API /set-default] Unsetting other defaults for document_type:", template.document_type)
      
      // Unset ALL other defaults for this document_type (company + global)
      // First: company templates
      const { data: companyData, error: companyUnsetError } = await supabase
        .from("templates")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .eq("document_type", template.document_type)
        .neq("id", templateId)
        .select("name")
      
      if (companyUnsetError) {
        console.error("❌ [API /set-default] Error unsetting company defaults:", companyUnsetError)
      } else {
        console.log("🟢 [API /set-default] Unset company templates:", companyData?.map(t => t.name))
      }

      // Second: global templates
      const { data: globalData, error: globalUnsetError } = await supabase
        .from("templates")
        .update({ is_default: false })
        .is("company_id", null)
        .eq("document_type", template.document_type)
        .neq("id", templateId)
        .select("name")
      
      if (globalUnsetError) {
        console.error("❌ [API /set-default] Error unsetting global defaults:", globalUnsetError)
        console.error("❌ [API /set-default] This likely means RLS policy is blocking!")
        console.error("❌ [API /set-default] Error details:", globalUnsetError)
      } else {
        console.log("🟢 [API /set-default] Unset global templates:", globalData?.map(t => t.name))
      }
    }

    // Update the template
    console.log("🟢 [API /set-default] Setting is_default =", isDefault, "for template:", template.name)
    const { data: updatedData, error: updateError } = await supabase
      .from("templates")
      .update({ is_default: isDefault })
      .eq("id", templateId)
      .select("name, is_default")
      .single()

    if (updateError) {
      console.error("❌ [API /set-default] Error updating template:", updateError)
      console.error("❌ [API /set-default] This likely means RLS policy is blocking!")
      return NextResponse.json(
        { ok: false, message: updateError.message },
        { status: 500 }
      )
    }

    console.log("✅ [API /set-default] Successfully updated template:", updatedData)

    return NextResponse.json({
      ok: true,
      message: isDefault ? "תבנית הוגדרה כברירת מחדל" : "תבנית הוסרה מברירת מחדל"
    })
  } catch (error) {
    console.error("Error in /api/templates/set-default:", error)
    return NextResponse.json(
      { ok: false, message: "שגיאה בעדכון תבנית" },
      { status: 500 }
    )
  }
}
