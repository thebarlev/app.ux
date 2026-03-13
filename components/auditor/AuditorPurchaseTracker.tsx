"use client"

import { useEffect } from "react"
import { normalizeTrackedPlan } from "@/lib/tracking/events"
import {
  AUDITOR_PURCHASE_PENDING_KEY,
  AUDITOR_PURCHASE_TRACKED_KEY,
  readAuditorPendingPurchase,
  trackPurchase,
} from "@/lib/tracking/purchase"

type PurchasePayload = {
  transaction_id?: string | null
  checkout_session_id?: string | null
  value?: number | null
  currency?: string | null
  plan?: string | null
}

type StatusResponse = {
  ok?: boolean
  has_subscription?: boolean
  status?: string | null
  purchase?: PurchasePayload | null
}

export function AuditorPurchaseTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const pending = readAuditorPendingPurchase()
    if (!pending) return

    let cancelled = false
    let attempts = 0
    let interval: number | null = null

    const finish = () => {
      window.sessionStorage.removeItem(AUDITOR_PURCHASE_PENDING_KEY)
    }

    const run = async () => {
      if (cancelled) return true
      attempts += 1

      const trackedTransactionId = String(window.sessionStorage.getItem(AUDITOR_PURCHASE_TRACKED_KEY) || "").trim()

      try {
        const res = await fetch("/api/auditor/billing/subscription/status", {
          method: "GET",
          cache: "no-store",
        })
        const json = (await res.json().catch(() => null)) as StatusResponse | null
        if (!res.ok || !json?.ok || json?.has_subscription !== true || json?.status !== "active") {
          return attempts >= 10
        }

        const purchase = json.purchase || null
        const transactionId = String(
          purchase?.transaction_id || pending.checkout_session_id || purchase?.checkout_session_id || ""
        ).trim()
        const plan = normalizeTrackedPlan(purchase?.plan || pending.plan)
        const valueRaw = purchase?.value ?? pending.value
        const value = Number(valueRaw)
        if (!transactionId || !plan || !Number.isFinite(value)) {
          return attempts >= 10
        }

        if (trackedTransactionId === transactionId) {
          finish()
          return true
        }

        trackPurchase(value, plan, transactionId)
        window.sessionStorage.setItem(AUDITOR_PURCHASE_TRACKED_KEY, transactionId)
        finish()
        return true
      } catch {
        return attempts >= 10
      }
    }

    void run().then((done) => {
      if (done || cancelled) return

      interval = window.setInterval(async () => {
        const shouldStop = await run()
        if (shouldStop || cancelled) {
          const currentInterval = interval
          if (currentInterval !== null) {
            window.clearInterval(currentInterval)
          }
        }
      }, 2000)
    })

    return () => {
      cancelled = true
      if (interval !== null) {
        window.clearInterval(interval)
      }
    }
  }, [])

  return null
}
