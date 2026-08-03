/**
 * Meta Pixel — client-safe wrapper.
 *
 * Shares one Pixel ID with the marketing site (uxellent.com). The _fbp cookie
 * is written on the registrable domain, so a visitor who arrives from a campaign
 * on uxellent.com and converts here is stitched into a single journey.
 *
 * Every export is a guarded no-op unless BOTH hold:
 *   1. NEXT_PUBLIC_META_PIXEL_ID is set
 *   2. the visitor has not explicitly rejected cookies
 *
 * Consent is opt-out: tags load by default and only an explicit "rejected" in
 * `vow_cookie_consent` blocks them. The app has no cookie banner of its own yet,
 * but it reads the same key so a rejection recorded on the marketing site is
 * honoured here once the key is shared across the domain.
 *
 * Analytics must never break a business flow, so nothing here throws — every
 * entry point swallows its own errors. Callers are not expected to await or
 * error-handle these.
 */

const CONSENT_KEY = "vow_cookie_consent"

type FbqParams = Record<string, unknown>
type FbqOptions = { eventID?: string }

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string }
    _fbq?: unknown
  }
}

/** Pixel ID is inlined at build time by Next, so this is safe on both server and client. */
export function getPixelId(): string {
  return (process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim()
}

/** Opt-out model: only an explicit rejection blocks tracking. */
export function hasConsent(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(CONSENT_KEY) !== "rejected"
  } catch {
    // Private mode / blocked storage: fall back to the opt-out default.
    return true
  }
}

export function isPixelEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(getPixelId()) && hasConsent()
}

/**
 * Event ID for future Conversions API deduplication: when the same conversion
 * is later sent server-side with this ID, Meta collapses the pair into one.
 */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The standard Meta bootstrap snippet, rendered inline by the root layout.
 * The consent check is inside the string on purpose: it has to run before the
 * network request, not after React mounts.
 */
export function metaPixelBootstrapScript(pixelId: string): string {
  const id = JSON.stringify(pixelId)
  const key = JSON.stringify(CONSENT_KEY)
  return (
    `try{if(localStorage.getItem(${key})==='rejected'){}else{` +
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
    `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
    `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
    `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
    `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
    `fbq('init',${id});fbq('track','PageView');` +
    `}}catch(e){}`
  )
}

function callFbq(args: unknown[]): void {
  if (!isPixelEnabled()) return
  try {
    const fbq = window.fbq
    if (typeof fbq !== "function") return
    fbq(...args)
  } catch {
    // Analytics never breaks a flow.
  }
}

/** Standard Meta event (Purchase, CompleteRegistration, Lead, ...). */
export function track(event: string, params?: FbqParams, eventId?: string): void {
  const options: FbqOptions = { eventID: eventId || newEventId() }
  callFbq(params ? ["track", event, params, options] : ["track", event, {}, options])
}

/** Custom (non-standard) event, e.g. DocumentIssued. */
export function trackCustom(event: string, params?: FbqParams, eventId?: string): void {
  const options: FbqOptions = { eventID: eventId || newEventId() }
  callFbq(params ? ["trackCustom", event, params, options] : ["trackCustom", event, {}, options])
}

/**
 * Client-side navigations do not re-run the bootstrap snippet, so route changes
 * need an explicit PageView. The initial PageView comes from the snippet.
 */
export function trackPageView(): void {
  callFbq(["track", "PageView"])
}

// ---------------------------------------------------------------------------
// Conversions
//
// These wrap the raw track() calls so the event names and payload shapes live
// in one place rather than being spelled out at each call site.
// ---------------------------------------------------------------------------

/** Signup finished: the company record exists and the account is usable. */
export function trackCompleteRegistration(params?: { method?: string }): void {
  track("CompleteRegistration", {
    content_name: "business_registration",
    status: true,
    ...(params?.method ? { method: params.method } : {}),
  })
}

/** Subscription paid and verified server-side. */
export function trackPurchase(params: {
  value: number | null | undefined
  currency?: string | null
  plan?: string | null
}): void {
  const value = typeof params.value === "number" && Number.isFinite(params.value) ? params.value : 0
  track("Purchase", {
    value,
    currency: params.currency || "ILS",
    ...(params.plan ? { content_name: params.plan, content_ids: [params.plan] } : {}),
  })
}

/**
 * A lead was captured. The existing captureLeadCreated() next to each call site
 * is a PostHog event and does not reach Meta, so this is sent alongside it
 * rather than instead of it.
 */
export function trackLead(params?: { source?: string; scanOutcome?: "scored" | "no_score" }): void {
  track("Lead", {
    ...(params?.source ? { content_name: params.source } : {}),
    /*
      Whether a report actually existed behind this lead.

      The gate now opens on a scan that ended without a score as well, so "Lead"
      no longer implies a deliverable. Without this dimension the ad reporting
      would show a cheaper CPL while quietly mixing in leads that can only be
      followed up by hand.
    */
    ...(params?.scanOutcome ? { scan_outcome: params.scanOutcome } : {}),
  })
}

/**
 * A document was issued. Custom rather than standard: no Meta standard event
 * describes it, and it is the product's core activation signal.
 */
export function trackDocumentIssued(params?: { documentType?: string }): void {
  trackCustom("DocumentIssued", {
    ...(params?.documentType ? { document_type: params.documentType } : {}),
  })
}
