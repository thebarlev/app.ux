export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"

const bodySchema = z.object({
  scanId: z.string().min(1),
  scanAccessToken: z.string().min(1),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id,scan_access_token,status,step,company_id")
    .eq("id", parsed.data.scanId)
    .maybeSingle()

  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  if (String(scan.scan_access_token || "") !== parsed.data.scanAccessToken) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  if ((scan as any).company_id) {
    const { checkAuditorCustomerActive } = await import("@/lib/auditor/customer-status")
    const { allowed, reason } = await checkAuditorCustomerActive(admin, {
      companyId: (scan as any).company_id,
    })
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
  }

  // Idempotency: if already terminal, don't attempt to continue/lock.
  if (scan.status === "done") {
    return NextResponse.json({ ok: true, status: scan.status, step: scan.step, done: true })
  }
  if (scan.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        error: "scan_failed",
        message: "This scan has failed and cannot be continued. Please start a new scan.",
        status: scan.status,
        step: scan.step,
        done: true,
      },
      { status: 409 }
    )
  }

  // Run one step per call (safe). Worker can run multiple in a loop.
  const res = await continueAuditorScan({ scanId: parsed.data.scanId, supabase: admin })
  if (!res.ok && res.kind === "busy") {
    return NextResponse.json({ ok: false, error: "scan is busy" }, { status: 409 })
  }
  if (!res.ok) {
    const message = "message" in res ? String((res as any).message) : res.kind
    const status = res.kind === "not_found" ? 404 : res.kind === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const s = res.scan || {}
  const done = s.status === "done" || s.status === "failed"
  return NextResponse.json({
    ok: true,
    status: s.status,
    step: s.step,
    done,
  })
}

