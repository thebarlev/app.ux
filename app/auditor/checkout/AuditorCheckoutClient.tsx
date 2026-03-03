"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function AuditorCheckoutClient(props: {
  linkId: string
  checkout: string
  scanId: string
  token: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(true)

  const linkId = useMemo(() => String(props.linkId || "").trim(), [props.linkId])
  const scanId = useMemo(() => String(props.scanId || "").trim(), [props.scanId])
  const token = useMemo(() => String(props.token || "").trim(), [props.token])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setIsWorking(true)
      setError(null)

      // If already subscribed: go to dashboard.
      try {
        const r = await fetch("/api/auditor/billing/subscription/status", { method: "GET" })
        const j = await r.json().catch(() => null)
        if (r.ok && j?.ok === true && j?.has_subscription === true) {
          const status = String(j?.status || "")
          if (status === "active") {
            router.replace("/auditor/dashboard")
            return
          }
        }
      } catch {
        // ignore and continue to checkout start
      }

      if (!linkId) {
        setError("חסר link_id. חזרו ללינק הרכישה מהאתר.")
        setIsWorking(false)
        return
      }

      try {
        const origin = typeof window !== "undefined" ? window.location.origin : ""
        const successUrl = `${origin}/auditor/success`
        const errorParams = new URLSearchParams({ checkout: "error" })
        if (linkId) errorParams.set("link_id", linkId)
        if (scanId) errorParams.set("scanId", scanId)
        if (token) errorParams.set("token", token)
        const body = {
          link_id: linkId,
          created_from_url: typeof window !== "undefined" ? window.location.href : null,
          success_url: successUrl,
          error_url: `${origin}/auditor/checkout?${errorParams.toString()}`,
        }

        const r = await fetch("/api/auditor/billing/checkout/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await r.json().catch(() => null)
        if (!r.ok) throw new Error(String(j?.error || `Failed (${r.status})`))

        const redirectUrl = String(j?.redirect_url || "").trim()
        if (!redirectUrl) throw new Error("Missing redirect_url")
        if (!cancelled) window.location.href = redirectUrl
      } catch (e: any) {
        if (cancelled) return
        setError(String(e?.message || e))
        setIsWorking(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [linkId, scanId, token, router])

  return (
    <main className="min-h-svh bg-[#F7F3EE] px-6 py-16">
      <div className="mx-auto max-w-xl text-right space-y-4">
        <h1 className="text-2xl font-semibold">פותחים סליקה…</h1>

        <p className="text-sm text-muted-foreground">
          אנחנו מעבירים אותך לדף תשלום מאובטח. אם זה לוקח יותר מכמה שניות, אפשר לנסות שוב.
        </p>

        {props.checkout === "error" ? (
          <div className="rounded-ui border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            התשלום לא הושלם. אפשר לנסות שוב.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-ui border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          {isWorking ? (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              מכינים תשלום…
            </div>
          ) : (
            <button
              type="button"
              className="rounded-ui bg-black px-4 py-2 text-white text-sm font-medium"
              onClick={() => router.refresh()}
            >
              נסו שוב
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

