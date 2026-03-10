"use client"

import { useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import {
  CheckCircle2,
  CreditCard,
  Calendar,
  Clock,
  Download,
  Loader2,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"

// ─── Types ──────────────────────────────────────────────────────────────────

type Locale = "he" | "en"

type SubscriptionStatus = {
  has_subscription: boolean
  plan_id: string | null
  status: string | null
  next_billing_date: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  last_invoice_id: string | null
}

type Invoice = {
  id: string
  period_start: string
  period_end: string
  amount: number
  currency: string
  document_id: string | null
  document_number: string | null
}

// ─── Strings ────────────────────────────────────────────────────────────────

const STRINGS = {
  he: {
    title: "מנוי וחיוב",
    subtitle: "ניהול החבילה, מחזור החיוב והחשבוניות שלך.",
    upgradePlan: "שדרג חבילה",
    currentPlan: "החבילה הנוכחית",
    planBasic: "חבילה בסיסית",
    planPro: "חבילה מקצועית",
    planPremium: "חבילה פרמיום",
    pricePerMonth: "לחודש",
    billingCycle: "חודשי",
    billingCycleLabel: "מחזור חיוב",
    status: "סטטוס",
    statusActive: "פעיל",
    statusCanceled: "מבוטל",
    statusPastDue: "חוב פתוח",
    statusBlocked: "חסום",
    statusPendingCancel: "יבוטל בסוף תקופה",
    billingDates: "תאריכי חיוב",
    billingStarted: "תחילת מנוי",
    currentPeriod: "תקופה נוכחית",
    nextBilling: "חיוב הבא",
    daysRemaining: "ימים לחידוש",
    billingProgress: "התקדמות מחזור חיוב",
    featuresTitle: "כלול בחבילה שלך",
    features: {
      basic: [
        "סריקת נוכחות AI חודשית",
        "אופטימיזציה לגוגל ומנועי AI",
        "דוח ביצועים",
        "תמיכה בדוא\"ל",
      ],
      pro: [
        "סריקת נוכחות AI חודשית",
        "אופטימיזציה לגוגל ומנועי AI",
        "שיפור נראות בחיפוש AI",
        "תמיכת מומחים",
        "דוח ביצועים מפורט",
      ],
      premium: [
        "סריקות AI בלתי מוגבלות",
        "אופטימיזציה מתקדמת לגוגל ומנועי AI",
        "שיפור נראות בחיפוש AI",
        "תמיכה אישית 1-על-1",
        "דוחות ביצועים מפורטים",
        "ייעוץ אסטרטגי חודשי",
      ],
    },
    billingHistory: "היסטוריית חיוב",
    billingHistoryDesc: "חשבוניות המנוי שלך",
    invoiceDate: "תאריך",
    invoiceAmount: "סכום",
    invoiceStatus: "סטטוס",
    invoiceDownload: "הורדה",
    invoicePaid: "שולם",
    invoiceProcessing: "בעיבוד",
    noInvoices: "אין חשבוניות עדיין.",
    cancelTitle: "ביטול מנוי",
    cancelDesc: "ביטול יפסיק את חידוש המנוי האוטומטי. החבילה תישאר פעילה עד תום תקופת החיוב הנוכחית.",
    cancelAlready: "המנוי מוגדר לביטול בסוף התקופה הנוכחית.",
    cancelBtn: "בטל מנוי",
    cancelModalTitle: "האם לבטל את המנוי?",
    cancelModalDesc: "תמשיך לקבל גישה עד תום תקופת החיוב הנוכחית. לאחר מכן, החבילה לא תתחדש.",
    cancelModalKeep: "שמור על המנוי",
    cancelModalConfirm: "אשר ביטול",
    loading: "טוען…",
    error: "לא ניתן לטעון את נתוני המנוי.",
    noSubscription: "אין מנוי פעיל.",
    noSubscriptionDesc: "כדי להתחיל, חזור לדשבורד וסרוק את האתר שלך.",
    ils: "₪",
    usd: "$",
  },
  en: {
    title: "Subscription & Billing",
    subtitle: "Manage your plan, billing cycle and invoices.",
    upgradePlan: "Upgrade plan",
    currentPlan: "Current Plan",
    planBasic: "Basic Plan",
    planPro: "Pro Plan",
    planPremium: "Premium Plan",
    pricePerMonth: "/ month",
    billingCycle: "Monthly",
    billingCycleLabel: "Billing cycle",
    status: "Status",
    statusActive: "Active",
    statusCanceled: "Canceled",
    statusPastDue: "Past due",
    statusBlocked: "Blocked",
    statusPendingCancel: "Cancels at period end",
    billingDates: "Billing dates",
    billingStarted: "Billing started",
    currentPeriod: "Current period",
    nextBilling: "Next billing",
    daysRemaining: "Days until renewal",
    billingProgress: "Billing cycle progress",
    featuresTitle: "Included in your plan",
    features: {
      basic: [
        "Monthly AI presence scan",
        "SEO & AI engine optimization",
        "Performance reporting",
        "Email support",
      ],
      pro: [
        "Monthly AI presence scan",
        "SEO & AI engine optimization",
        "AI search visibility improvements",
        "Expert support",
        "Detailed performance reporting",
      ],
      premium: [
        "Unlimited AI scans",
        "Advanced SEO & AI engine optimization",
        "AI search visibility improvements",
        "Personal 1-on-1 support",
        "Detailed performance reports",
        "Monthly strategic consulting",
      ],
    },
    billingHistory: "Billing history",
    billingHistoryDesc: "Your subscription invoices",
    invoiceDate: "Date",
    invoiceAmount: "Amount",
    invoiceStatus: "Status",
    invoiceDownload: "Invoice",
    invoicePaid: "Paid",
    invoiceProcessing: "Processing",
    noInvoices: "No invoices yet.",
    cancelTitle: "Cancel Subscription",
    cancelDesc: "Canceling will stop future renewals. Your plan will remain active until the end of the current billing period.",
    cancelAlready: "Your subscription is set to cancel at the end of the current billing period.",
    cancelBtn: "Cancel subscription",
    cancelModalTitle: "Cancel your subscription?",
    cancelModalDesc: "You will keep access until the end of your current billing period. After that, your plan will not renew.",
    cancelModalKeep: "Keep subscription",
    cancelModalConfirm: "Cancel subscription",
    loading: "Loading…",
    error: "Could not load subscription data.",
    noSubscription: "No active subscription.",
    noSubscriptionDesc: "To get started, go back to the dashboard and run a scan.",
    ils: "₪",
    usd: "$",
  },
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────

const PLAN_NAMES_HE: Record<string, string> = {
  basic: "חבילה בסיסית",
  pro: "חבילה מקצועית",
  premium: "חבילה פרמיום",
}

const ILS_PRICES: Record<string, string> = {
  basic: "97",
  pro: "197",
  premium: "997",
}

function getPlanName(planId: string, t: typeof STRINGS["en"]): string {
  if (t === STRINGS.he) return PLAN_NAMES_HE[planId] ?? planId
  if (planId === "basic")   return t.planBasic
  if (planId === "pro")     return t.planPro
  if (planId === "premium") return t.planPremium
  return planId
}

function getPlanPrice(planId: string, locale: Locale): string {
  if (locale === "he") return `${ILS_PRICES[planId] ?? "—"} ₪`
  const usd = PLAN_PRICES_USD[planId as keyof typeof PLAN_PRICES_USD]
  return usd != null ? `$${usd}` : "—"
}

function getPlanFeatures(planId: string, t: typeof STRINGS["en"]): string[] {
  const key = planId as keyof typeof t.features
  return t.features[key] ?? t.features.pro
}

function getStatusLabel(status: string | null, cancelAtPeriodEnd: boolean, t: typeof STRINGS["en"]): string {
  if (cancelAtPeriodEnd) return t.statusPendingCancel
  if (status === "active")    return t.statusActive
  if (status === "canceled")  return t.statusCanceled
  if (status === "past_due")  return t.statusPastDue
  if (status === "blocked")   return t.statusBlocked
  return status ?? "—"
}

function getStatusVariant(status: string | null, cancelAtPeriodEnd: boolean): "default" | "secondary" | "destructive" | "outline" {
  if (cancelAtPeriodEnd)       return "secondary"
  if (status === "active")     return "default"
  if (status === "past_due")   return "destructive"
  if (status === "blocked")    return "destructive"
  if (status === "canceled")   return "outline"
  return "secondary"
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—"
  try {
    return format(parseISO(iso), locale === "en" ? "MMM d, yyyy" : "d/M/yyyy")
  } catch {
    return iso
  }
}

function calcCycleProgress(start: string | null, end: string | null): { pct: number; daysLeft: number; elapsed: number; total: number } {
  if (!start || !end) return { pct: 0, daysLeft: 0, elapsed: 0, total: 30 }
  const s = parseISO(start).getTime()
  const e = parseISO(end).getTime()
  const now = Date.now()
  const total   = Math.max(1, (e - s) / 86400000)
  const elapsed = Math.max(0, (now - s) / 86400000)
  const daysLeft = Math.max(0, Math.ceil((e - now) / 86400000))
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
  return { pct, daysLeft, elapsed: Math.floor(elapsed), total: Math.round(total) }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </p>
  )
}

function MetaRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-800 text-end ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AuditorSubscriptionClient({
  locale = "he",
  basePath = "/auditor",
}: {
  locale?: Locale
  basePath?: string
}) {
  const t = STRINGS[locale]
  const isRtl = locale === "he"
  const dir = isRtl ? "rtl" : "ltr"
  const lang = locale === "en" ? "en" : "he"

  const [sub, setSub]             = useState<SubscriptionStatus | null>(null)
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelDone, setCancelDone] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/auditor/billing/subscription/status").then((r) => r.json()),
      fetch("/api/auditor/billing/invoices").then((r) => r.json()),
    ])
      .then(([statusJson, invoicesJson]) => {
        if (statusJson?.has_subscription !== undefined) setSub(statusJson as SubscriptionStatus)
        if (invoicesJson?.ok && Array.isArray(invoicesJson.invoices)) setInvoices(invoicesJson.invoices)
      })
      .catch(() => setError(t.error))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCancel = async () => {
    setCanceling(true)
    try {
      const r = await fetch("/api/auditor/billing/subscription/cancel", { method: "POST" })
      if (r.ok) {
        setCancelDone(true)
        setSub((prev) => prev ? { ...prev, cancel_at_period_end: true } : prev)
      }
    } finally {
      setCanceling(false)
      setCancelOpen(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div dir={dir} className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div dir={dir} className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  // ── No subscription ───────────────────────────────────────────────────────
  if (!sub?.has_subscription) {
    return (
      <div dir={dir} className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-800">{t.noSubscription}</h2>
        <p className="text-sm text-slate-500">{t.noSubscriptionDesc}</p>
      </div>
    )
  }

  const planId    = sub.plan_id ?? "pro"
  const features  = getPlanFeatures(planId, t)
  const cycle     = calcCycleProgress(sub.current_period_start, sub.current_period_end)
  const isCanceled = sub.cancel_at_period_end || sub.status === "canceled"

  return (
    <div dir={dir} className="mx-auto max-w-[1100px] space-y-8 px-4 py-8">

      {/* ── Section 1: Page header ─────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-start justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={isRtl ? "text-end" : "text-start"}>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <Button variant="outline" disabled className="gap-2 opacity-60 cursor-not-allowed">
          <ArrowUpRight className="h-4 w-4" />
          {t.upgradePlan}
        </Button>
      </div>

      {/* ── Section 2: Current Plan Card ──────────────────────────────────── */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Accent strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />
        <CardHeader className={`pb-3 ${isRtl ? "text-end" : "text-start"}`}>
          <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
              <CreditCard className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.currentPlan}</p>
              <CardTitle className="mt-0.5 text-xl font-bold text-slate-900">
                {getPlanName(planId, t)}
              </CardTitle>
            </div>
            <div className="ms-auto">
              <Badge variant={getStatusVariant(sub.status, sub.cancel_at_period_end)}>
                {getStatusLabel(sub.status, sub.cancel_at_period_end, t)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isRtl ? "text-end" : "text-start"}>
          <div className="grid grid-cols-1 gap-0 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:rtl:divide-x-reverse">
            <div className="py-4 sm:pe-6">
              <p className="text-xs text-slate-400">{t.pricePerMonth}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {getPlanPrice(planId, locale)}
              </p>
            </div>
            <div className="py-4 sm:ps-6 space-y-0">
              <MetaRow label={t.billingCycleLabel} value={t.billingCycle} />
              <MetaRow label={t.status} value={
                <Badge variant={getStatusVariant(sub.status, sub.cancel_at_period_end)} className="text-xs">
                  {getStatusLabel(sub.status, sub.cancel_at_period_end, t)}
                </Badge>
              } />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3+4: Billing Cycle + Progress ─────────────────────────── */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className={`pb-2 ${isRtl ? "text-end" : "text-start"}`}>
          <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
            <Calendar className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-base font-semibold text-slate-800">{t.billingDates}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className={`space-y-5 ${isRtl ? "text-end" : "text-start"}`}>
          <div className="space-y-0">
            <MetaRow
              label={t.currentPeriod}
              value={`${formatDate(sub.current_period_start, locale)} → ${formatDate(sub.current_period_end, locale)}`}
            />
            <MetaRow
              label={t.nextBilling}
              value={formatDate(sub.next_billing_date, locale)}
            />
            <MetaRow
              label={t.daysRemaining}
              value={
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-900 tabular-nums">{cycle.daysLeft}</span>
                </span>
              }
            />
          </div>

          {/* Billing progress bar */}
          <div className="space-y-2">
            <div className={`flex items-center justify-between text-xs text-slate-500 ${isRtl ? "flex-row-reverse" : ""}`}>
              <span>{t.billingProgress}</span>
              <span className="font-semibold tabular-nums text-slate-700">{cycle.pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-700"
                style={{ width: `${cycle.pct}%` }}
              />
            </div>
            <div className={`flex items-center justify-between text-[11px] text-slate-400 ${isRtl ? "flex-row-reverse" : ""}`}>
              <span dir="ltr">{formatDate(sub.current_period_start, locale)}</span>
              <span dir="ltr">{formatDate(sub.current_period_end, locale)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Plan Features ───────────────────────────────────────── */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className={`pb-2 ${isRtl ? "text-end" : "text-start"}`}>
          <CardTitle className="text-base font-semibold text-slate-800">{t.featuresTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {features.map((feature, i) => (
              <li key={i} className={`flex items-start gap-2.5 ${isRtl ? "flex-row-reverse" : ""}`}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Section 6: Billing History ────────────────────────────────────── */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className={`pb-2 ${isRtl ? "text-end" : "text-start"}`}>
          <CardTitle className="text-base font-semibold text-slate-800">{t.billingHistory}</CardTitle>
          <p className="text-xs text-slate-400">{t.billingHistoryDesc}</p>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className={`text-sm text-slate-400 py-2 ${isRtl ? "text-end" : "text-start"}`}>{t.noInvoices}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {[t.invoiceDate, t.invoiceAmount, t.invoiceStatus, t.invoiceDownload].map((h) => (
                      <th
                        key={h}
                        className={`py-2 px-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${isRtl ? "text-end" : "text-start"} first:ps-0 last:pe-0`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`py-3 px-3 first:ps-0 ${isRtl ? "text-end" : "text-start"}`}>
                        <div className="font-medium text-slate-800" dir="ltr">
                          {formatDate(inv.period_start, locale)}
                        </div>
                        <div className="text-xs text-slate-400" dir="ltr">
                          {formatDate(inv.period_start, locale)} – {formatDate(inv.period_end, locale)}
                        </div>
                      </td>
                      <td className={`py-3 px-3 font-semibold tabular-nums text-slate-800 ${isRtl ? "text-end" : "text-start"}`} dir="ltr">
                        {inv.currency === "USD" ? "$" : "₪"}{inv.amount}
                      </td>
                      <td className={`py-3 px-3 ${isRtl ? "text-end" : "text-start"}`}>
                        <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          {inv.document_id ? t.invoicePaid : t.invoiceProcessing}
                        </Badge>
                      </td>
                      <td className={`py-3 px-3 last:pe-0 ${isRtl ? "text-end" : "text-start"}`}>
                        {inv.document_id ? (
                          <a
                            href={`/api/documents/${inv.document_id}/pdf?lang=${lang}&issue=copy`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {inv.document_number ? `#${inv.document_number}` : t.invoiceDownload}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">{t.invoiceProcessing}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 7: Cancel Subscription ───────────────────────────────── */}
      {!isCanceled && (
        <>
          <Separator />
          <Card className="rounded-2xl border border-red-100 bg-red-50/40 shadow-sm">
            <CardContent className="p-6">
              <div className={`flex flex-wrap items-start justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
                <div className={`space-y-1 ${isRtl ? "text-end" : "text-start"}`}>
                  <h3 className="text-sm font-semibold text-slate-800">{t.cancelTitle}</h3>
                  <p className="text-sm text-slate-500 max-w-lg">{t.cancelDesc}</p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400"
                  onClick={() => setCancelOpen(true)}
                >
                  {t.cancelBtn}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Already-canceling notice */}
      {sub.cancel_at_period_end && (
        <div className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 ${isRtl ? "flex-row-reverse" : ""}`}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{t.cancelAlready}</p>
        </div>
      )}

      {/* ── Section 8: Cancel Confirmation Dialog ────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent dir={dir} className="max-w-md bg-white text-gray-900">
          <DialogHeader className={isRtl ? "text-end items-end" : "text-start"}>
            <DialogTitle>{t.cancelModalTitle}</DialogTitle>
            <DialogDescription className="mt-1 text-slate-500">
              {t.cancelModalDesc}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={`mt-2 flex gap-2 ${isRtl ? "flex-row-reverse justify-start" : "justify-end"}`}>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={canceling}>
              {t.cancelModalKeep}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={canceling}
              className="gap-2"
            >
              {canceling && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.cancelModalConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
