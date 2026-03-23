import posthog from "posthog-js"

export function getPosthog() {
  if (typeof window === "undefined") return null
  if (posthog.__loaded) return posthog

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || "phc_erab0j3LzgfEgD4shpvf8YQqFGDdo0Uli6YOpKmf3dL"
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
  if (!key) return null

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    enable_recording_console_log: false,
    session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug()
    },
  })
  ;(window as any).posthog = posthog

  return posthog
}
