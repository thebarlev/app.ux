"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeTrackedPlan, pushEvent } from "@/lib/tracking/events"
import { cn } from "@/lib/utils"

type PlanRow = {
  id: string
  name: string
  price_monthly: number | null
  documents_per_month: number
  overage_unit_price: number
  is_featured: boolean
}

function formatNis(n: number): string {
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`
}

export default function PricingClient({ plans }: { plans: PlanRow[] }) {
  const router = useRouter()
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const view = useMemo(() => {
    const filtered = (plans || []).filter((p) => p && p.id !== "free")
    // Ensure at least two cards in UI (basic + pro)
    return filtered
  }, [plans])

  async function startCheckout(planId: string) {
    const trackedPlan = normalizeTrackedPlan(planId)
    if (trackedPlan) {
      pushEvent("package_click", {
        plan: trackedPlan,
      })
    }

    setBusyPlanId(planId)
    try {
      const res = await fetch("/api/billing/checkout/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          billing_interval: "month",
          success_url: `${window.location.origin}/billing/success`,
          error_url: `${window.location.origin}/billing/error`,
        }),
      })
      const json = await res.json().catch(() => ({} as any))
      const redirectUrl = String((json as any)?.redirect_url || "")
      if (!res.ok || !redirectUrl) {
        throw new Error(String((json as any)?.message || "checkout_failed"))
      }
      window.location.href = redirectUrl
    } catch {
      router.push("/billing/error")
    } finally {
      setBusyPlanId(null)
    }
  }

  return (
    <div dir="rtl" className="min-h-[calc(100vh-80px)] bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-fg">בחרו מסלול שמתאים לכם</h1>
          <p className="text-muted-fg">חיוב חודשי בלבד. ניתן לשדרג בכל עת.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {view.map((p) => {
            const price = typeof p.price_monthly === "number" ? p.price_monthly : Number(p.price_monthly || 0)
            const overage = Number(p.overage_unit_price || 0)
            const featured = !!p.is_featured
            const isBusy = busyPlanId === p.id

            return (
              <Card
                key={p.id}
                className={cn(
                  "border bg-white shadow-ui-sm relative overflow-hidden",
                  featured ? "ring-2 ring-primary" : "border-muted"
                )}
              >
                {featured && (
                  <div className="absolute top-4 left-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                    המומלץ ביותר
                  </div>
                )}

                <CardContent className="p-6 text-right space-y-4">
                  <div className="space-y-1">
                    <div className="text-xl font-bold text-fg">{p.name}</div>
                    <div className="text-sm text-muted-fg">{p.documents_per_month} מסמכים בחודש כלולים</div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div className="text-4xl font-extrabold text-fg">{formatNis(price)}</div>
                    <div className="text-muted-fg">/ לחודש</div>
                  </div>

                  <div className="rounded-ui bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <div className="text-muted-fg">מחיר למסמך מעבר למכסה</div>
                      <div className="font-semibold text-fg">{formatNis(overage)}</div>
                    </div>
                  </div>

                  <Button
                    className={cn("w-full", featured ? "" : "")}
                    variant={featured ? "primary" : "secondary"}
                    disabled={isBusy}
                    onClick={() => startCheckout(p.id)}
                  >
                    {isBusy ? "מעביר לתשלום..." : "הצטרפות"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

