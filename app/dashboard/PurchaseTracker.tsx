"use client"

import { useEffect } from "react"
import { useSubscriptionStatus } from "@/components/subscription/useSubscriptionStatus"

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>
  }
}

/**
 * Fires the vow_purchase analytics event once after a successful purchase.
 * Preserved verbatim from the previous dashboard page.
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
      window.sessionStorage.setItem("vow_purchase_tracked", "true")
      window.sessionStorage.removeItem("vow_purchase_pending")
    }
  }, [subscription])

  return null
}
