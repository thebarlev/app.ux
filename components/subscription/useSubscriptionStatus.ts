"use client"

import { useEffect, useState } from "react"

export type SubscriptionStatusResponse =
  | { ok: false; message?: string }
  | {
      ok: true
      plan_id: string
      plan_price: number | null
      currency: string
      status: string
      status_reason: null | "trial_ended" | "subscription_expired" | "account_blocked" | "limit_reached"
      trial_ends_at: string | null
      current_period_end: string | null
      documents_used: number
      documents_limit: number
      upgrade_url: string | null
      upgrade_available: boolean
    }

export function useSubscriptionStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const [state, setState] = useState<SubscriptionStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch("/api/subscription/status", { method: "GET" })
        const json = (await res.json().catch(() => ({}))) as SubscriptionStatusResponse
        if (cancelled) return
        setState(json)
      } catch (e: any) {
        if (cancelled) return
        setState({ ok: false, message: e?.message || "fetch_failed" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { state, loading }
}
