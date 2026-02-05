import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { signUpgradeState } from "@/lib/billing/upgrade-state"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

function firstDayOfMonthUtcIso(now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = rateLimit({ key: `subscription-status:${ip}`, limit: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const companyId = await getCompanyIdForUser()
  const now = new Date()
  const yearMonth = firstDayOfMonthUtcIso(now)

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("company_id, plan_id, status, trial_ends_at, current_period_end")
    .eq("company_id", companyId)
    .maybeSingle()

  if (subError || !sub) {
    return NextResponse.json(
      { ok: false, message: "Subscription not available" },
      { status: 500 }
    )
  }

  const planId = String((sub as any).plan_id || "free")
  const status = String((sub as any).status || "trial")
  const trialEndsAt = (sub as any).trial_ends_at ? String((sub as any).trial_ends_at) : null
  const currentPeriodEnd = (sub as any).current_period_end ? String((sub as any).current_period_end) : null

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("documents_per_month")
    .eq("id", planId)
    .maybeSingle()

  if (planError || !plan) {
    return NextResponse.json({ ok: false, message: "Plan not available" }, { status: 500 })
  }

  const documentsLimit = Number((plan as any).documents_per_month ?? 0) || 0

  const { data: usage, error: usageError } = await supabase
    .from("usage_monthly")
    .select("documents_count")
    .eq("company_id", companyId)
    .eq("year_month", yearMonth)
    .maybeSingle()

  if (usageError) {
    return NextResponse.json({ ok: false, message: "Usage not available" }, { status: 500 })
  }

  const documentsUsed = Number((usage as any)?.documents_count ?? 0) || 0

  // status_reason mirrors server enforcement (issue/finalize is blocked; read-only remains allowed)
  let statusReason: null | "trial_ended" | "subscription_expired" | "account_blocked" | "limit_reached" = null

  if (["blocked", "canceled", "past_due"].includes(status)) {
    statusReason = "account_blocked"
  } else if (status === "trial" && trialEndsAt && now > new Date(trialEndsAt)) {
    statusReason = "trial_ended"
  } else if (status === "active" && (!currentPeriodEnd || now > new Date(currentPeriodEnd))) {
    statusReason = "subscription_expired"
  } else if (documentsLimit > 0 && documentsUsed >= documentsLimit) {
    statusReason = "limit_reached"
  }

  // Placeholder until marketing site is live
  const baseUpgradeUrl = process.env.MARKETING_UPGRADE_URL_BASE || "https://vow.co.il/pricing"
  let upgradeUrl: string | null = null
  try {
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 15 * 60
    const state = signUpgradeState({ company_id: companyId, iat, exp })
    upgradeUrl = `${baseUpgradeUrl}?state=${encodeURIComponent(state)}`
  } catch {
    upgradeUrl = `${baseUpgradeUrl}`
  }

  return NextResponse.json({
    ok: true,
    plan_id: planId,
    status,
    status_reason: statusReason,
    trial_ends_at: trialEndsAt,
    current_period_end: currentPeriodEnd,
    documents_used: documentsUsed,
    documents_limit: documentsLimit,
    year_month: yearMonth,
    upgrade_url: upgradeUrl,
    upgrade_available: false,
  })
}

