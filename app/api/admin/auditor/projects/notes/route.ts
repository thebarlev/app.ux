export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"

export async function POST(req: Request) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : null
  const content = typeof body?.content === "string" ? body.content.trim() : null

  if (!projectId || !content) {
    return NextResponse.json({ error: "projectId and content required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id ?? null

  const admin = createServiceRoleClient()
  const { data: note, error } = await admin
    .from("auditor_project_notes")
    .insert({
      project_id: projectId,
      content,
      created_by_user_id: userId,
    } as Record<string, unknown>)
    .select("id, content, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note })
}
