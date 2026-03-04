/**
 * Admin-only debug route: verify Auditor billing/company linkage for a user.
 * GET /api/admin/auditor/debug-user-billing?userId=... or ?email=...
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getAuditorConfig } from "@/lib/auditor/env"

export async function GET(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")?.trim() || null
  const email = url.searchParams.get("email")?.trim()?.toLowerCase() || null

  if (!userId && !email) {
    return NextResponse.json({ error: "Provide userId or email" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  let resolvedUserId = userId
  if (!resolvedUserId && email) {
    try {
      const { data } = await (admin as any).auth.admin.listUsers({ perPage: 1000 })
      const match = data?.users?.find((u: any) => String(u?.email || "").toLowerCase() === email)
      resolvedUserId = match?.id ? String(match.id) : null
    } catch {
      resolvedUserId = null
    }
  }

  const userCompanyIds: string[] = []
  if (resolvedUserId) {
    const { data: members } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", resolvedUserId)
    for (const m of members || []) {
      if ((m as any)?.company_id) userCompanyIds.push(String((m as any).company_id))
    }
    const { data: owned } = await admin
      .from("companies")
      .select("id")
      .eq("auth_user_id", resolvedUserId)
    for (const c of owned || []) {
      if ((c as any)?.id) userCompanyIds.push(String((c as any).id))
    }
  }

  let subs: any[] = []
  if (resolvedUserId && userCompanyIds.length > 0) {
    const { data } = await admin
      .from("auditor_subscriptions")
      .select("company_id,customer_id,plan_id,status,next_billing_date")
      .in("company_id", userCompanyIds)
    subs = (data || []) as any[]
  }

  const companyIdsFromSubs = [...new Set((subs as any[]).map((s: any) => s?.company_id).filter(Boolean))]

  const charges =
    companyIdsFromSubs.length > 0
      ? await admin
          .from("auditor_subscription_charges")
          .select("id,company_id,subscription_period_start,amount,status,issued_invoice_id")
          .in("company_id", companyIdsFromSubs)
          .order("subscription_period_start", { ascending: false })
          .limit(20)
      : { data: [] }
  const chargeList = (charges as any)?.data || []

  const docIds = chargeList
    .map((c: any) => c?.issued_invoice_id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)

  const documents =
    docIds.length > 0
      ? await admin
          .from("documents")
          .select("id,company_id,document_number,document_type,document_status")
          .in("id", docIds)
      : { data: [] }
  const docList = (documents as any)?.data || []

  return NextResponse.json({
    userId: resolvedUserId,
    email: email || null,
    user_company_ids: [...new Set(userCompanyIds)],
    auditor_subscriptions: subs,
    auditor_subscription_charges: chargeList,
    documents_for_charges: docList,
  })
}
