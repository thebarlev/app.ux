"use client"

import { useEffect } from "react"
import { useSubscriptionStatus } from "@/components/subscription/useSubscriptionStatus"
import { trackPurchase } from "@/lib/analytics/meta-pixel"
import { pushEvent } from "@/lib/tracking/events"

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
      /*
        Through pushEvent like every other event, rather than a raw dataLayer
        push of its own. This was a fifth consumer of the dead container, missed
        in the first sweep because it wrote to the dataLayer directly instead of
        going through the helper.
      */
      pushEvent("vow_purchase", {
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
