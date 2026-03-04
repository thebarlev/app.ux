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
  const title = typeof body?.title === "string" ? body.title.trim() : null

  if (!projectId || !title) {
    return NextResponse.json({ error: "projectId and title required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id ?? null

  const admin = createServiceRoleClient()
  const { data: task, error } = await admin
    .from("auditor_project_tasks")
    .insert({
      project_id: projectId,
      title,
      status: "pending",
      created_by_user_id: userId,
    } as Record<string, unknown>)
    .select("id, title, description, status, due_date, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, task })
}

export async function PATCH(req: Request) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : null
  const status = typeof body?.status === "string" ? body.status.trim() : null

  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 })
  }

  const valid = ["pending", "in_progress", "done", "cancelled"]
  if (!valid.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: task, error } = await admin
    .from("auditor_project_tasks")
    .update({ status, updated_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("id", taskId)
    .select("id, title, status")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, task })
}
