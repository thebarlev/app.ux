"use client"

import { normalizeTrackedPlan, pushEvent, type TrackablePlan } from "./events"

export const AUDITOR_CHECKOUT_TRACKING_KEY = "auditor_checkout_tracking_context"
export const AUDITOR_PURCHASE_PENDING_KEY = "auditor_purchase_pending"
export const AUDITOR_PURCHASE_TRACKED_KEY = "auditor_purchase_tracked"

export type AuditorCheckoutTrackingContext = {
  checkout_session_id: string
  plan: TrackablePlan
  value: number
  currency: string
  created_at: number
}

export function saveAuditorCheckoutTrackingContext(context: AuditorCheckoutTrackingContext) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(AUDITOR_CHECKOUT_TRACKING_KEY, JSON.stringify(context))
}

export function readAuditorCheckoutTrackingContext(): AuditorCheckoutTrackingContext | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(AUDITOR_CHECKOUT_TRACKING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuditorCheckoutTrackingContext>
    if (!parsed || typeof parsed.checkout_session_id !== "string") return null
    const plan = normalizeTrackedPlan(parsed.plan)
    const value = Number(parsed.value)
    const currency = String(parsed.currency || "").trim() || "USD"
    if (!plan || !Number.isFinite(value)) return null
    return {
      checkout_session_id: parsed.checkout_session_id,
      plan,
      value,
      currency,
      created_at: Number(parsed.created_at || Date.now()),
    }
  } catch {
    return null
  }
}

export function moveAuditorCheckoutContextToPendingPurchase() {
  if (typeof window === "undefined") return null
  const context = readAuditorCheckoutTrackingContext()
  if (!context) return null
  window.sessionStorage.setItem(AUDITOR_PURCHASE_PENDING_KEY, JSON.stringify(context))
  window.sessionStorage.removeItem(AUDITOR_CHECKOUT_TRACKING_KEY)
  return context
}

export function readAuditorPendingPurchase(): AuditorCheckoutTrackingContext | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(AUDITOR_PURCHASE_PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuditorCheckoutTrackingContext>
    if (!parsed || typeof parsed.checkout_session_id !== "string") return null
    const plan = normalizeTrackedPlan(parsed.plan)
    const value = Number(parsed.value)
    const currency = String(parsed.currency || "").trim() || "USD"
    if (!plan || !Number.isFinite(value)) return null
    return {
      checkout_session_id: parsed.checkout_session_id,
      plan,
      value,
      currency,
      created_at: Number(parsed.created_at || Date.now()),
    }
  } catch {
    return null
  }
}

export function trackPurchase(orderValue: number, planName: string, transactionId?: string) {
  if (typeof window === "undefined") return

  const normalizedPlan = normalizeTrackedPlan(planName)
  if (!Number.isFinite(orderValue) || !normalizedPlan) return

  pushEvent("purchase", {
    transaction_id: transactionId,
    value: orderValue,
    currency: "USD",
    plan: normalizedPlan,
  })
}
