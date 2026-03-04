export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"

const ALLOWED_KEYS = [
  "domain",
  "website_url",
  "keyword_1",
  "keyword_2",
  "keyword_3",
  "business_type",
  "seo_goal",
  "region_type",
  "region_value",
  "status",
]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { projectId } = await params
  const body = await req.json().catch(() => ({}))
  const updates: Record<string, string | null> = {}
  for (const k of ALLOWED_KEYS) {
    if (k in body) {
      const v = body[k]
      updates[k] = v === null || v === undefined || v === "" ? null : String(v).trim()
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from("auditor_projects")
    .update(updates as Record<string, unknown>)
    .eq("id", projectId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, project: data })
}
