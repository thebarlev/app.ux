import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig, isAuditorAllowedEmail, type AuditorConfig } from "./env"
import { getFirstCompanyIdForAuditor } from "./company"

export type AuditorApiContext = {
  config: AuditorConfig
  user: { id: string; email: string | null }
  companyId: string
}

export function auditorNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 })
}

export function auditorForbidden(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 403 })
}

export function auditorUnauthorized(message: string = "Unauthorized"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 401 })
}

/** Returns true if company has active subscription or at least one succeeded charge. */
async function hasActiveSubscriptionOrPaidCharge(companyId: string): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { data: sub } = await admin
    .from("auditor_subscriptions")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle()
  if (sub?.company_id) return true

  const { data: charge } = await admin
    .from("auditor_subscription_charges")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle()
  return !!charge?.id
}

export async function requireAuditorApiAccess(): Promise<AuditorApiContext | NextResponse> {
  const config = getAuditorConfig()
  if (!config.enabled) return auditorNotFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return auditorUnauthorized("משתמש לא מחובר")

  const companyId = await getFirstCompanyIdForAuditor(supabase as any)
  if (!companyId) return auditorUnauthorized("לא נמצאה חברה פעילה")

  const isPayingCustomer = await hasActiveSubscriptionOrPaidCharge(companyId)
  if (!isPayingCustomer) {
    const email = typeof user.email === "string" ? user.email : null
    if (!isAuditorAllowedEmail(email)) return auditorForbidden("אין הרשאה")
  }

  const email = typeof user.email === "string" ? user.email : null
  return {
    config,
    user: { id: user.id, email },
    companyId,
  }
}

