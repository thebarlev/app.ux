"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SubscriptionStatusResponse =
  | { ok: false; message?: string }
  | {
      ok: true
      plan_id: string
      status: string
      status_reason: null | "trial_ended" | "subscription_expired" | "account_blocked" | "limit_reached"
      trial_ends_at: string | null
      current_period_end: string | null
      documents_used: number
      documents_limit: number
      upgrade_url: string | null
      upgrade_available: boolean
    }

function formatDateHe(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("he-IL")
}

function statusLabel(status: string): string {
  if (status === "trial") return "ניסיון"
  if (status === "active") return "פעיל"
  if (status === "blocked") return "חסום"
  if (status === "canceled") return "בוטל"
  if (status === "past_due") return "חוב פתוח"
  return status || "—"
}

type StatusReason = "trial_ended" | "subscription_expired" | "account_blocked" | "limit_reached"

function reasonMessage(reason: StatusReason | null): string | null {
  switch (reason) {
    case "limit_reached":
      return "הגעת למגבלת המסמכים החודשית. לא ניתן להפיק מסמכים חדשים."
    case "trial_ended":
      return "תקופת הניסיון הסתיימה. לא ניתן להפיק מסמכים חדשים."
    case "subscription_expired":
      return "המנוי פג. לא ניתן להפיק מסמכים חדשים."
    case "account_blocked":
      return "החשבון חסום. לא ניתן להפיק מסמכים חדשים."
    default:
      return null
  }
}

export function SubscriptionUsageCard() {
  const [state, setState] = useState<SubscriptionStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch("/api/subscription/status", { method: "GET" })
        const json = (await res.json().catch(() => ({}))) as SubscriptionStatusResponse
        if (cancelled) return
        setState(json)
      } catch (e: any) {
        if (cancelled) return
        setState({ ok: false, message: e?.message || "fetch_failed" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const view = useMemo(() => {
    if (!state) return null
    if (!state.ok) {
      return {
        ok: false as const,
        title: "מנוי ושימוש חודשי",
        message: state.message || "לא ניתן לטעון סטטוס מנוי",
      }
    }

    const limit = Number.isFinite(state.documents_limit) ? state.documents_limit : 0
    const used = Number.isFinite(state.documents_used) ? state.documents_used : 0
    const pct = limit > 0 ? Math.min(100, Math.max(0, Math.round((used / limit) * 100))) : 0
    const blockMsg = state.status_reason ? reasonMessage(state.status_reason) : null

    return {
      ok: true as const,
      title: "מנוי ושימוש חודשי",
      status: statusLabel(state.status),
      planId: state.plan_id,
      used,
      limit,
      pct,
      trialEnds: formatDateHe(state.trial_ends_at),
      currentPeriodEnd: formatDateHe(state.current_period_end),
      blockMsg,
      isBlocked: !!state.status_reason,
      upgradeUrl: state.upgrade_url,
    }
  }, [state])

  return (
    <Card className="border-0 shadow-ui-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-right">
            <div className="text-lg font-semibold text-fg">{view?.title || "מנוי ושימוש חודשי"}</div>
            <div className="text-sm text-muted-fg">
              {loading ? "טוען..." : view && "ok" in view && view.ok ? `סטטוס: ${view.status}` : "—"}
            </div>
          </div>

          <Button variant="secondary" disabled className="shrink-0">
            שדרוג בקרוב
          </Button>
        </div>

        {view && "ok" in view && !view.ok && (
          <div className="text-right text-sm text-danger">
            {view.message}
          </div>
        )}

        {view && "ok" in view && view.ok && (
          <>
            {view.blockMsg && (
              <div className="text-right text-sm font-medium text-danger">{view.blockMsg}</div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-fg">{view.used} / {view.limit} מסמכים החודש</div>
                <div className={cn("font-medium", view.pct >= 100 ? "text-danger" : "text-fg")}>{view.pct}%</div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={cn("h-2 rounded-full transition-all", view.pct >= 100 ? "bg-danger" : "bg-primary")}
                  style={{ width: `${view.pct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-right">
              <div className="rounded-ui bg-white p-3 border border-muted">
                <div className="text-muted-fg">תוקף ניסיון</div>
                <div className="font-medium">{view.trialEnds}</div>
              </div>
              <div className="rounded-ui bg-white p-3 border border-muted">
                <div className="text-muted-fg">תוקף מנוי</div>
                <div className="font-medium">{view.currentPeriodEnd}</div>
              </div>
            </div>


          </>
        )}
      </CardContent>
    </Card>
  )
}

