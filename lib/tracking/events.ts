"use client"

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

/**
 * Send an event to GA4 directly, not into a container.
 *
 * This used to push `{ event: name, ...payload }` onto the dataLayer, which is
 * the shape GTM consumes. The container it was aimed at — GTM-WNGC226Q — was
 * registered under an account that no longer exists and cannot be administered
 * from either remaining one, so every event this function sent went into a queue
 * nothing was reading. Four call sites were affected: package_click,
 * register_started, onboarding_step and scan_started.
 *
 * gtag('event', ...) is the shape GA4's own gtag.js reads, and that script is
 * loaded directly in app/layout.tsx.
 *
 * The fallback is not defensive padding. Both the gtag stub and gtag.js load
 * with strategy="afterInteractive", so there is a real window early in the page
 * where window.gtag is undefined — an event fired in that window would vanish.
 * Pushing the arguments-shaped array is what the canonical gtag stub does, and
 * gtag.js drains the queue once it loads.
 */
export function pushEvent(eventName: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return

  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }

  if (typeof w.gtag === "function") {
    w.gtag("event", eventName, payload)
    return
  }

  w.dataLayer = w.dataLayer || []
  w.dataLayer.push(["event", eventName, payload])
}
