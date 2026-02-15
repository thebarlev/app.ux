export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { NextResponse } from "next/server"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = rateLimit({ key: `templates-user:${ip}`, limit: 120, windowMs: 60_000 })
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
    }

    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, message: "משתמש לא מחובר" }, { status: 401 })
    }

    // Get company ID
    let companyId: string | null = null
    try {
      companyId = await getCompanyIdForUser()
    } catch {
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
      return NextResponse.json({ ok: false, message: "שגיאה בטעינת תבניות" }, { status: 500 })
    }

    const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === "true"
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] /api/templates/user-templates result:", {
        companyId: companyId?.substring(0, 8) || "null",
        count: data?.length || 0,
        templates: data?.map((t: any) => ({
          id: String(t.id).substring(0, 8),
          name: t.name,
          document_type: t.document_type,
          company_id: t.company_id ? String(t.company_id).substring(0, 8) : "global",
          is_default: t.is_default,
          is_active: t.is_active,
        })),
      })
    }

    const templateIds = (data || []).map((t: any) => t.id).filter(Boolean)
    let documentTypesByTemplateId: Record<string, string[]> = {}
    if (templateIds.length > 0) {
      const { data: mappingRows } = await supabase
        .from("template_document_types")
        .select("template_id, document_type")
        .in("template_id", templateIds)

      documentTypesByTemplateId = (mappingRows || []).reduce((acc: Record<string, string[]>, row: any) => {
        const tid = row.template_id
        if (!acc[tid]) acc[tid] = []
        if (row.document_type) acc[tid].push(row.document_type)
        return acc
      }, {})
    }

    const templatesWithMappings = (data || []).map((t: any) => ({
      ...t,
      document_types:
        documentTypesByTemplateId[t.id]?.length > 0
          ? Array.from(new Set(documentTypesByTemplateId[t.id]))
          : t.document_type
            ? [t.document_type]
            : [],
    }))

    return NextResponse.json({
      ok: true,
      templates: templatesWithMappings,
    })
  } catch (error) {
    console.error("Error in /api/templates/user-templates:", error)
    return NextResponse.json({ ok: false, message: "שגיאה בטעינת תבניות" }, { status: 500 })
  }
}

