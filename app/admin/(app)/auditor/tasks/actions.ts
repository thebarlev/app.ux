"use server"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { revalidatePath } from "next/cache"

export async function resolveTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from("auditor_tasks")
    .update({ status: "fixed", resolved_at: new Date().toISOString() } as any)
    .eq("id", taskId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/auditor/tasks")
  return { ok: true }
}

export async function closeTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from("auditor_tasks")
    .update({ status: "wont_fix", resolved_at: new Date().toISOString() } as any)
    .eq("id", taskId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/auditor/tasks")
  return { ok: true }
}

export async function createTaskFromFinding(
  findingId: string,
  scanId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()
  const admin = createServiceRoleClient()

  const { data: finding } = await admin
    .from("auditor_scan_findings")
    .select("rule_key")
    .eq("id", findingId)
    .single()

  const { error } = await admin.from("auditor_tasks").insert({
    scan_id: scanId,
    finding_id: findingId,
    rule_key: finding?.rule_key ?? null,
    status: "open",
  } as any)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/auditor/scans/${scanId}`)
  return { ok: true }
}
