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
    if (initializedRef.current) return
    initializedRef.current = true
    getPosthog()
  }, [])

  useEffect(() => {
    if (identifiedRef.current) return
    identifiedRef.current = true

    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const userId = String(data?.user?.id || "").trim()
      if (!userId) return
      identifyPosthogUser(userId)
    }).catch(() => {
      // No-op: analytics should never break app flow.
    })
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
