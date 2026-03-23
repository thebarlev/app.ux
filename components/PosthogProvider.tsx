"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getPosthog } from "@/lib/posthog"
import { identifyPosthogUser } from "@/lib/analytics/posthog-events"

export default function PosthogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initializedRef = useRef(false)
  const identifiedRef = useRef(false)

  useEffect(() => {
    console.log("PostHog init running", typeof window)
    if (typeof window === "undefined") return
    if (initializedRef.current) return
    initializedRef.current = true
    const ph = getPosthog()
    console.log("PostHog initialized", Boolean(ph), Boolean((window as any).posthog))
  }, [])

  useEffect(() => {
    if (identifiedRef.current) return
    identifiedRef.current = true

    const supabase = createClient()
    ;(async () => {
      try {
        const result = await supabase.auth.getUser()
        const userId = String(result?.data?.user?.id || "").trim()
        if (!userId) return
        identifyPosthogUser(userId)
      } catch {
        // No-op: analytics should never break app flow.
      }
    })()
  }, [])

  useEffect(() => {
    const ph = getPosthog()
    if (!ph || !pathname) return

    const lang = pathname.startsWith("/en") ? "en" : "he"
    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : "")

    ph.capture("vow_page_view", {
      page_path: url,
      page_language: lang,
      page_dir: lang === "en" ? "ltr" : "rtl",
    })
  }, [pathname, searchParams])

  return <>{children}</>
}
