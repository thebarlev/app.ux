"use client"

import { useEffect, useState } from "react"

export function ConfirmOnSuccessClient({ lowProfileCode }: { lowProfileCode: string | null }) {
  const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    const code = (lowProfileCode || "").trim()
    if (!code) return

    let cancelled = false
    setStatus("running")

    fetch(`/api/billing/cardcom/confirm?lowprofilecode=${encodeURIComponent(code)}`, {
      method: "GET",
      credentials: "include",
      headers: { "cache-control": "no-store" },
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setStatus("error")
          setMessage(String((json as any)?.message || "confirm_failed"))
          return
        }
        setStatus("ok")
        setMessage(String((json as any)?.paid ? "אומת תשלום והופעלו עדכונים" : "התשלום טרם אומת"))

        if (typeof window !== "undefined" && (json as any)?.paid === true && (json as any)?.updated_subscription === true) {
          window.sessionStorage.setItem(
            "vow_purchase_pending",
            JSON.stringify({
              lowProfileCode: code,
              ts: Date.now(),
            })
          )
          window.sessionStorage.removeItem("vow_purchase_tracked")
        }
      })
      .catch((e) => {
        if (cancelled) return
        setStatus("error")
        setMessage(String((e as any)?.message || "network_error"))
      })

    return () => {
      cancelled = true
    }
  }, [lowProfileCode])

  if (!lowProfileCode) return null

  return (
    <div className="text-sm text-muted-fg">
      {status === "idle" && null}
      {status === "running" && "מאמת תשלום..."}
      {status === "ok" && message}
      {status === "error" && `אימות תשלום נכשל: ${message}`}
    </div>
  )
}

