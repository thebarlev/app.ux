"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { ScanHistoryRow } from "@/components/dashboard/ScanHistoryRow"

type Locale = "he" | "en"

const STRINGS = {
  he: {
    title: "היסטוריית סריקות",
    desc: "הסריקות האחרונות של החשבון",
    loading: "טוען…",
    empty: "אין סריקות עדיין.",
    errorLoad: "לא הצלחנו לטעון את ההיסטוריה.",
    columnDomain: "דומיין",
    columnStep: "שלב",
    columnStatus: "סטטוס",
    columnScore: "ציון",
  },
  en: {
    title: "Scan History",
    desc: "Recent scans for this account",
    loading: "Loading…",
    empty: "No scans yet.",
    errorLoad: "Could not load scan history.",
    columnDomain: "Domain",
    columnStep: "Step",
    columnStatus: "Status",
    columnScore: "Score",
  },
}

export function ScanHistoryAccordion({
  locale = "he",
  currentScanId,
}: {
  locale?: Locale
  /** Optionally exclude the current active scan (already shown in results) */
  currentScanId?: string | null
}) {
  const t = STRINGS[locale]
  const isRtl = locale === "he"
  const dir = isRtl ? "rtl" : "ltr"

  const [open, setOpen] = useState(false)
  const [scans, setScans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Fetch once when accordion is first opened
  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    setLoadError(null)
    fetch("/api/auditor/scans")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.scans)) {
          setScans(j.scans)
        } else {
          setLoadError(t.errorLoad)
        }
      })
      .catch(() => setLoadError(t.errorLoad))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [open, loaded, t.errorLoad])

  const visibleScans = currentScanId
    ? scans.filter((s) => s.id !== currentScanId)
    : scans

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      dir={dir}
    >
      {/* ── Accordion header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[52px] items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
        style={{ direction: dir }}
        aria-expanded={open}
      >
        <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
          <div className={isRtl ? "text-right" : "text-left"}>
            <p className="text-sm font-semibold text-slate-800">{t.title}</p>
            <p className="mt-0.5 text-xs text-slate-400">{t.desc}</p>
          </div>
        </div>

        {loaded && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-semibold"
            style={{ background: "#ede9fe", color: "#6366f1" }}
          >
            {visibleScans.length}
          </span>
        )}
      </button>

      {/* ── Collapsible content ── */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: open ? "3000px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {/* Column headers */}
          {!loading && visibleScans.length > 0 && (
            <div
              className="mb-2 hidden grid-cols-[1fr_auto_auto_auto] gap-4 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:grid"
              style={{ direction: dir }}
            >
              <span>{t.columnDomain}</span>
              <span>{t.columnStep}</span>
              <span>{t.columnStatus}</span>
              <span>{t.columnScore}</span>
            </div>
          )}

          {loading && (
            <div className="space-y-2 py-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-xl bg-slate-100"
                  style={{ opacity: 1 - i * 0.2 }}
                />
              ))}
            </div>
          )}

          {loadError && (
            <p className="py-4 text-center text-sm text-red-500">{loadError}</p>
          )}

          {!loading && !loadError && visibleScans.length === 0 && (
            <p className={`py-4 text-sm text-slate-400 ${isRtl ? "text-right" : "text-left"}`}>
              {t.empty}
            </p>
          )}

          {!loading && !loadError && visibleScans.length > 0 && (
            <div className="space-y-2">
              {visibleScans.map((s: any) => (
                <ScanHistoryRow key={s.id} s={s} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
