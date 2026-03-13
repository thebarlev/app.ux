"use client"

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>
  }
}

export type TrackablePlan = "basic" | "pro" | "expert"

export function normalizeTrackedPlan(planName: string | null | undefined): TrackablePlan | null {
  const raw = String(planName || "").trim().toLowerCase()
  if (!raw) return null
  if (raw === "basic" || raw === "starter") return "basic"
  if (raw === "pro" || raw === "professional") return "pro"
  if (raw === "expert" || raw === "premium") return "expert"
  return null
}

export function planFromLinkId(linkId: string | null | undefined): TrackablePlan | null {
  const raw = String(linkId || "").trim().toLowerCase()
  if (!raw) return null
  if (raw.includes("basic")) return "basic"
  if (raw.includes("pro")) return "pro"
  if (raw.includes("expert") || raw.includes("premium")) return "expert"
  return null
}

export function pushEvent(eventName: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: eventName,
    ...payload,
  })
}
