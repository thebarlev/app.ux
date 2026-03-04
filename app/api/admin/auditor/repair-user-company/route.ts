/**
 * Admin-only: Repair user–company linkage for paid Auditor users who see "אין חברה פעילה".
 * POST /api/admin/auditor/repair-user-company
 * Body: { userId?: string, email?: string }
 *
 * Finds the user's company from auditor_subscriptions/charges/leads and ensures
 * company_members + companies.auth_user_id are set so user_company_ids() returns the company.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getAuditorConfig } from "@/lib/auditor/env"

export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const userId = typeof body?.userId === "string" ? body.userId.trim() : null
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null

  if (!userId && !email) {
    return NextResponse.json({ error: "Provide userId or email in body" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  let resolvedUserId = userId
  if (!resolvedUserId && email) {
    const { data } = await (admin as any).auth.admin.listUsers({ perPage: 1000 })
    const match = data?.users?.find((u: any) => String(u?.email || "").toLowerCase() === email)
    resolvedUserId = match?.id ? String(match.id) : null
  }
  if (!resolvedUserId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Check if user already has company
  const { data: members } = await admin.from("company_members").select("company_id").eq("user_id", resolvedUserId)
  const { data: owned } = await admin.from("companies").select("id").eq("auth_user_id", resolvedUserId)
  const existingIds = [
    ...(members || []).map((m: any) => m?.company_id).filter(Boolean),
    ...(owned || []).map((c: any) => c?.id).filter(Boolean),
  ]
  if (existingIds.length > 0) {
    return NextResponse.json({
      ok: true,
      message: "User already has company access",
      user_company_ids: [...new Set(existingIds)],
    })
  }

  // Find company from auditor_subscriptions (via auditor_customers.user_id or auditor_leads)
  let companyId: string | null = null

  const { data: cust } = await admin
    .from("auditor_customers")
    .select("company_id")
    .eq("user_id", resolvedUserId)
    .limit(1)
    .maybeSingle()
  if ((cust as any)?.company_id) companyId = String((cust as any).company_id)

  if (!companyId && email) {
    const { data: lead } = await admin
      .from("auditor_leads")
      .select("id,company_id")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((lead as any)?.company_id) companyId = String((lead as any).company_id)
  }

  if (!companyId && email) {
    const { data: comp } = await admin.from("companies").select("id").eq("email", email).maybeSingle()
    if ((comp as any)?.id) companyId = String((comp as any).id)
  }

  if (!companyId && email) {
    const { data: checkouts } = await admin
      .from("auditor_checkout_sessions")
      .select("company_id")
      .eq("status", "paid")
      .not("company_id", "is", null)
      .limit(20)
    const cids = [...new Set((checkouts || []).map((c: any) => c?.company_id).filter(Boolean))]
    for (const cid of cids) {
      const { data: comp } = await admin.from("companies").select("id,email").eq("id", cid).maybeSingle()
      if (String((comp as any)?.email || "").toLowerCase() === email) {
        companyId = cid
        break
      }
    }
  }

  if (!companyId) {
    return NextResponse.json({ error: "No Auditor company found for this user" }, { status: 404 })
  }

  // Repair: set companies.auth_user_id and company_members
  const { error: updErr } = await admin
    .from("companies")
    .update({ auth_user_id: resolvedUserId } as any)
    .eq("id", companyId)
  if (updErr) {
    return NextResponse.json({ error: "Failed to update companies.auth_user_id", detail: String(updErr?.message || updErr) }, { status: 500 })
  }

  const { error: memberErr } = await admin.from("company_members").upsert(
    {
      company_id: companyId,
      user_id: resolvedUserId,
      role: "owner",
      accepted_at: new Date().toISOString(),
    } as any,
    { onConflict: "company_id,user_id" }
  )
  if (memberErr) {
    return NextResponse.json({ error: "Failed to upsert company_members", detail: String((memberErr as any)?.message || memberErr) }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: "Repaired: user linked to company",
    userId: resolvedUserId,
    companyId,
    user_company_ids: [companyId],
  })
}
