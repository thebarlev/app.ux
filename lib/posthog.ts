import posthog from "posthog-js"

export function getPosthog() {
  if (typeof window === "undefined") return null
  if (posthog.__loaded) return posthog

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key) return null

  posthog.init(key, {
    api_host: host || "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    enable_recording_console_log: false,
    session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug()
    },
  })

  return posthog
}
