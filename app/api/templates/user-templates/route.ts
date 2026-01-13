import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, message: "משתמש לא מחובר" },
        { status: 401 }
      )
    }

    // Get company ID
    let companyId: string | null = null
    try {
      companyId = await getCompanyIdForUser()
    } catch (error) {
      // User might not have a company (admin)
      console.log("No company for user, loading global templates only")
    }

    // Fetch templates: company's + globals
    let query = supabase
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })

    if (companyId) {
      query = query.or(`company_id.eq.${companyId},company_id.is.null`)
    } else {
      // Only globals for users without company
      query = query.is("company_id", null)
    }

    const { data, error } = await query

    if (error) {
      console.error("[TEMPLATE_FETCH] /api/templates/user-templates error:", error)
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      )
    }

    const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] /api/templates/user-templates result:", {
        companyId: companyId?.substring(0, 8) || 'null',
        count: data?.length || 0,
        templates: data?.map((t: any) => ({
          id: t.id.substring(0, 8),
          name: t.name,
          document_type: t.document_type,
          company_id: t.company_id ? t.company_id.substring(0, 8) : 'global',
          is_default: t.is_default,
          is_active: t.is_active
        }))
      })
    }

    return NextResponse.json({
      ok: true,
      templates: data || []
    })
  } catch (error) {
    console.error("Error in /api/templates/user-templates:", error)
    return NextResponse.json(
      { ok: false, message: "שגיאה בטעינת תבניות" },
      { status: 500 }
    )
  }
}
