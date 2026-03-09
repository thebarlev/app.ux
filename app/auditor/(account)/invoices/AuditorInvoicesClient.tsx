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

const TEXTS = {
  he: {
    loading: "טוען…",
    loadError: "שגיאה בטעינה",
    emptyTitle: "אין חשבוניות עדיין",
    emptyDesc: "החשבוניות שלך יופיעו כאן לאחר חידוש המנוי.",
    download: "הורדה",
    preparing: "בהכנה",
    docNumberPrefix: "מס׳",
  },
  en: {
    loading: "Loading…",
    loadError: "Failed to load",
    emptyTitle: "No invoices yet",
    emptyDesc: "Your subscription invoices will appear here.",
    download: "Download",
    preparing: "Processing",
    docNumberPrefix: "#",
  },
} as const

export default function AuditorInvoicesClient({ language = "he" }: { language?: "he" | "en" }) {
  const t = TEXTS[language]
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
          setError(j?.error || t.loadError)
        }
      })
      .catch(() => {
        if (!cancelled) setError(t.loadError)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t.loadError])

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(language === "en" ? "en-US" : "he-IL", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    } catch {
      return iso
    }
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      ) : error ? (
        <div className="rounded-ui border border-danger/30 bg-danger/5 p-4 text-danger">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-ui border border-border bg-white p-8 text-center">
          <p className="font-medium text-muted-foreground">{t.emptyTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t.emptyDesc}</p>
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
                  {inv.document_number ? ` · ${t.docNumberPrefix} ${inv.document_number}` : ""}
                </div>
              </div>
              {inv.document_id ? (
                <a
                  href={`/api/documents/${inv.document_id}/pdf?lang=${language}&issue=copy`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-ui border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  {t.download}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">{t.preparing}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
