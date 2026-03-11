"use server"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

export async function retryScan(scanId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()
  try {
    const h = await headers()
    const host = h.get("host") ?? "localhost:3000"
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
    const res = await fetch(`${protocol}://${host}/api/admin/auditor/scan/continue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scanId }),
    })
    if (!res.ok && res.status !== 409) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: j?.error ?? `HTTP ${res.status}` }
    }
    revalidatePath("/admin/auditor/scans")
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function cancelScan(scanId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSystemAdmin()
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from("auditor_scans")
    .update({ status: "failed", step: "done", error: "Cancelled by admin" } as any)
    .eq("id", scanId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/auditor/scans")
  return { ok: true }
}
