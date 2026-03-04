export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireAuditorApiAccess } from "@/lib/auditor/guard"
import { checkAuditorCustomerActive } from "@/lib/auditor/customer-status"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"

export async function POST(_: Request, ctx: { params: Promise<{ scanId: string }> }) {
  const access = await requireAuditorApiAccess()
  if (access instanceof NextResponse) return access

  const admin = createServiceRoleClient()
  const { allowed, reason } = await checkAuditorCustomerActive(admin, { companyId: access.companyId })
  if (!allowed) {
    const msg =
      reason === "customer_past_due"
        ? "Payment is past due. Please update your payment method to continue."
        : reason === "customer_canceled"
          ? "Subscription was canceled. Renew to run scans."
          : reason === "customer_inactive"
            ? "Account is inactive. Please contact support."
            : "Subscription is not active. Payment required to run scans."
    return NextResponse.json({ ok: false, error: msg }, { status: 402 })
  }

  const { scanId } = await ctx.params
  const res = await continueAuditorScan({ scanId, companyId: access.companyId })

  if (!res.ok && res.kind === "busy") {
    return NextResponse.json({ ok: false, error: "scan is busy" }, { status: 409 })
  }
  if (!res.ok) {
    const message = "message" in res ? String((res as any).message) : res.kind
    const status = res.kind === "not_found" ? 404 : res.kind === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  return NextResponse.json({ ok: true, scan: res.scan })
}

