"use client"

import { useEffect, useMemo, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { trackPageView } from "@/lib/analytics/meta-pixel"

/**
 * Fires a Meta PageView on client-side navigations.
 *
 * The first PageView is already sent by the bootstrap snippet in the root
 * layout, so the initial route is recorded and skipped here — otherwise every
 * landing would be counted twice.
 *
 * Must be rendered inside <Suspense> because of useSearchParams.
 */
export default function MetaPixelRouteTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const routeKey = useMemo(() => {
    const qs = searchParams?.toString() ?? ""
    return `${pathname ?? ""}?${qs}`
  }, [pathname, searchParams])

  const lastRouteKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return

    // First run: the snippet already fired PageView for this route.
    if (lastRouteKeyRef.current === null) {
      lastRouteKeyRef.current = routeKey
      return
    }

    if (lastRouteKeyRef.current === routeKey) return
    lastRouteKeyRef.current = routeKey

    trackPageView()
  }, [pathname, routeKey])

  return null
}
