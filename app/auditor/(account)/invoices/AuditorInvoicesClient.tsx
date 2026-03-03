"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

type Invoice = {
  id: string
  period_start: string
  period_end: string
  amount: number
  currency: string
  document_id: string | null
  document_number: string | null
}

export default function AuditorInvoicesClient() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auditor/billing/invoices")
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (cancelled) return
        if (j?.ok === true && Array.isArray(j.invoices)) {
          setInvoices(j.invoices)
        } else {
          setError(j?.error || "שגיאה בטעינה")
        }
      })
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינה")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString("he-IL", { year: "numeric", month: "short", day: "numeric" })
    } catch {
      return iso
    }
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          טוען…
        </div>
      ) : error ? (
        <div className="rounded-ui border border-danger/30 bg-danger/5 p-4 text-danger">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-ui border border-border bg-white p-8 text-center text-muted-foreground">
          אין חשבוניות עדיין
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-ui border border-border bg-white p-4"
            >
              <div>
                <div className="font-medium">
                  {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {inv.amount} {inv.currency}
                  {inv.document_number ? ` · מס׳ ${inv.document_number}` : ""}
                </div>
              </div>
              {inv.document_id ? (
                <a
                  href={`/api/documents/${inv.document_id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-ui border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  הורדה
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">בהכנה</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
