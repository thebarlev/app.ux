import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { logSecurityEvent } from "@/lib/security/audit-log"

/**
 * Toggle `documents.is_goal_marked` for the admin panel.
 *
 * ── ⛔ WHY THIS ROUTE EXISTS AT ALL ─────────────────────────────────────────
 *
 * The toggle used to run in the browser: `components/admin/company-details.tsx` held a
 * Supabase client and issued `.from("documents").update({ is_goal_marked })` straight from
 * the page, with the anon key that ships in every bundle. Two things were wrong with that.
 *
 * First, migration 138 makes `documents_update` draft-only, and this flag is set on final
 * documents, so the browser write stops working. Second — and this is the reason it should
 * never have been there — a write to the documents table issued from the browser is exactly
 * what the registrar's declaration says does not happen. The only thing that stood between a
 * user and that column was the UI not offering the button.
 *
 * ── WHAT AUTHORISES THE SERVICE-ROLE WRITE ─────────────────────────────────
 *
 * `requireSystemAdmin()` — a session lookup against `system_admins`. This flag is an
 * operator's marker across every tenant, so the predicate is "is a system admin", not
 * company ownership; a company check would be wrong here, because an admin legitimately
 * marks documents belonging to companies they are not a member of.
 *
 * Nothing else about the document is touched: one boolean column, by id.
 */

const bodySchema = z.object({
  isGoalMarked: z.boolean(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>
  try {
    admin = await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const rl = rateLimit({ key: `admin-goal-marked:${admin.adminId}:${ip}`, limit: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const { documentId } = await params
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Missing document id" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  }

  const { error } = await createAdminClient()
    .from("documents")
    .update({ is_goal_marked: parsed.data.isGoalMarked })
    .eq("id", documentId)

  if (error) {
    console.error("[ADMIN goal-marked] update failed", { documentId, error: error.message })
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 })
  }

  logSecurityEvent({
    event: "admin_action",
    outcome: "succeeded",
    userId: admin.userId,
    companyId: null,
    requestId: null,
    ip,
    path: new URL(req.url).pathname,
    meta: { action: "documents.is_goal_marked", documentId, value: parsed.data.isGoalMarked },
  })

  return NextResponse.json({ ok: true })
}
