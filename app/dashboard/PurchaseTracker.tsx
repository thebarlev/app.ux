"use client"

import { useEffect } from "react"
import { useSubscriptionStatus } from "@/components/subscription/useSubscriptionStatus"
import { trackPurchase } from "@/lib/analytics/meta-pixel"

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>
  }
}

/**
 * Fires the purchase analytics events once after a successful purchase.
 *
 * This runs after /billing/success has already confirmed the charge with
 * Cardcom server-side, so reaching here means the payment is verified rather
 * than merely attempted. The existing vow_purchase_tracked flag keeps it to a
 * single fire per purchase, which the Meta event reuses.
 */
export default function PurchaseTracker() {
  const { state: subscription } = useSubscriptionStatus()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!subscription || !subscription.ok) return

    const pendingPurchase = window.sessionStorage.getItem("vow_purchase_pending")
    const alreadyTracked = window.sessionStorage.getItem("vow_purchase_tracked")

    if (subscription.status === "active" && pendingPurchase && !alreadyTracked) {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({
        event: "vow_purchase",
        plan: subscription.plan_id,
        value: subscription.plan_price,
        currency: subscription.currency || "ILS",
      })

      trackPurchase({
        value: subscription.plan_price,
        currency: subscription.currency,
        plan: subscription.plan_id,
      })

      window.sessionStorage.setItem("vow_purchase_tracked", "true")
      window.sessionStorage.removeItem("vow_purchase_pending")
    }
  }, [subscription])

  return null
}
