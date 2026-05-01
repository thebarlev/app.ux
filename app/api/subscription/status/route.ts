import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { signUpgradeState } from "@/lib/billing/upgrade-state"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import {
  isUnlimitedByEmail,
  isUnlimitedByCompany,
  UNLIMITED_DOCUMENTS_LIMIT,
} from "@/lib/subscription-unlimited"

async function getCompanyIdForUserMinimal(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}): Promise<string> {
  // Prefer membership (multi-tenant)
  const { data: membership } = await params.supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", params.userId)
    .maybeSingle()

  if (membership?.company_id) return String(membership.company_id)

  // Fallback to owner company
  const { data: company } = await params.supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", params.userId)
    .maybeSingle()

  if (company?.id) return String(company.id)

  throw new Error("company_not_found")
}

function deriveAnniversaryMonthWindow(now: Date, anchor: Date): { start: Date; end: Date } {
  // Compute rolling [start, end) monthly window anchored at `anchor` day-of-month.
  // Uses (year, month) parts of Postgres age()-style logic.
  const months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth())
  const start = new Date(anchor.getTime())
  start.setUTCMonth(start.getUTCMonth() + months)
  if (start.getTime() > now.getTime()) {
    start.setUTCMonth(start.getUTCMonth() - 1)
  }
  const end = new Date(start.getTime())
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

function currentCalendarMonthRangeYmd(now: Date): { fromDate: string; toDate: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 0))
  const toYmd = (d: Date) => d.toISOString().slice(0, 10)
  return { fromDate: toYmd(from), toDate: toYmd(to) }
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

  let companyId: string
  try {
    companyId = await getCompanyIdForUserMinimal({ supabase, userId: auth.user.id })
  } catch {
    // חשבונות ללא מגבלה - גם בלי חברה
    if (isUnlimitedByEmail(auth.user.email)) {
      return NextResponse.json({
        ok: true,
        plan_id: "pro",
        plan_price: null,
        currency: "ILS",
        status: "active",
        status_reason: null,
        trial_ends_at: null,
        current_period_end: null,
        documents_used: 0,
        documents_limit: 1_000_000,
        upgrade_url: null,
        upgrade_available: false,
      })
    }
    return NextResponse.json({ ok: false, message: "Company not found" }, { status: 404 })
  }

  const now = new Date()

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select(
      "company_id, plan_id, status, trial_starts_at, trial_ends_at, current_period_start, current_period_end, " +
      "plan_snapshot_documents_limit, plan_snapshot_price, plan_snapshot_currency"
    )
    .eq("company_id", companyId)
    .maybeSingle()

  if (subError || !sub) {
    // חשבונות ללא מגבלה - גם בלי שורת מנוי
    if (isUnlimitedByEmail(auth.user.email) || isUnlimitedByCompany(companyId)) {
      return NextResponse.json({
        ok: true,
        plan_id: "pro",
        plan_price: null,
        currency: "ILS",
        status: "active",
        status_reason: null,
        trial_ends_at: null,
        current_period_end: null,
        documents_used: 0,
        documents_limit: UNLIMITED_DOCUMENTS_LIMIT,
        upgrade_url: null,
        upgrade_available: false,
      })
    }
    return NextResponse.json(
      { ok: false, message: "Subscription not available" },
      { status: 500 }
    )
  }

  const planId = String((sub as any).plan_id || "free")
  const status = String((sub as any).status || "trial")
  const trialStartsAt = (sub as any).trial_starts_at ? String((sub as any).trial_starts_at) : null
  const trialEndsAt = (sub as any).trial_ends_at ? String((sub as any).trial_ends_at) : null
  const currentPeriodStart = (sub as any).current_period_start ? String((sub as any).current_period_start) : null
  const currentPeriodEnd = (sub as any).current_period_end ? String((sub as any).current_period_end) : null
  const planPriceRaw = (sub as any).plan_snapshot_price
  const planPrice = typeof planPriceRaw === "number" ? planPriceRaw : planPriceRaw != null ? Number(planPriceRaw) : null
  const currency = String((sub as any).plan_snapshot_currency || "ILS").trim() || "ILS"

  const documentsLimit = isUnlimitedByCompany(companyId)
    ? UNLIMITED_DOCUMENTS_LIMIT
    : Number((sub as any).plan_snapshot_documents_limit ?? 0) || 0

  // Period-based usage: count finalized docs within the current subscription period
  let periodStartIso: string | null = null
  let periodEndIso: string | null = null
  const isFreeLikePlan = planId === "free" || planId === "free_patur"

  if (isFreeLikePlan) {
    if (currentPeriodStart && currentPeriodEnd) {
      periodStartIso = currentPeriodStart
      periodEndIso = currentPeriodEnd
    } else if (trialStartsAt) {
      const win = deriveAnniversaryMonthWindow(now, new Date(trialStartsAt))
      periodStartIso = win.start.toISOString()
      periodEndIso = win.end.toISOString()
    } else {
      // Fallback: calendar-like month window if no anchor
      const win = deriveAnniversaryMonthWindow(now, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
      periodStartIso = win.start.toISOString()
      periodEndIso = win.end.toISOString()
    }
  } else {
    periodStartIso = currentPeriodStart
    periodEndIso = currentPeriodEnd
  }

  // Count finalized docs in the current CALENDAR month (align with Revenue report/source-of-truth query).
  let documentsUsed = 0
  {
    const { fromDate, toDate } = currentCalendarMonthRangeYmd(now)
    const { count, error: countErr } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("document_status", "final")
      .gte("issue_date", fromDate)
      .lte("issue_date", toDate)
    if (countErr) {
      return NextResponse.json({ ok: false, message: "Usage not available" }, { status: 500 })
    }
    documentsUsed = Number(count || 0) || 0
  }

  // status_reason mirrors server enforcement (issue/finalize is blocked; read-only remains allowed)
  // חשבונות ללא מגבלה - לא מחזירים status_reason
  const isUnlimited = isUnlimitedByEmail(auth.user.email) || isUnlimitedByCompany(companyId)
  let statusReason: null | "trial_ended" | "subscription_expired" | "account_blocked" | "limit_reached" = null

  if (!isUnlimited && ["blocked", "canceled", "past_due"].includes(status)) {
    statusReason = "account_blocked"
  } else if (!isUnlimited && !isFreeLikePlan && status === "active" && (!periodEndIso || now >= new Date(periodEndIso))) {
    statusReason = "subscription_expired"
  } else if (
    isFreeLikePlan &&
    documentsLimit > 0 &&
    documentsUsed >= documentsLimit &&
    !isUnlimitedByCompany(companyId)
  ) {
    statusReason = "limit_reached"
  }

  // Placeholder until marketing site is live
  const baseUpgradeUrl = process.env.MARKETING_UPGRADE_URL_BASE || "https://uxellent.com/pricing"
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
    plan_id: isUnlimited ? "pro" : planId,
    plan_price: isUnlimited ? null : (Number.isFinite(planPrice) ? planPrice : null),
    currency,
    status: isUnlimited ? "active" : status,
    status_reason: statusReason,
    trial_ends_at: trialEndsAt,
    current_period_end: periodEndIso,
    documents_used: documentsUsed,
    documents_limit: documentsLimit,
    upgrade_url: upgradeUrl,
    upgrade_available: isUnlimited ? false : isFreeLikePlan,
  })
}

