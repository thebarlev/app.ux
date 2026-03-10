"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { ScanHistoryRow } from "@/components/dashboard/ScanHistoryRow"

type DashboardStrings = {
  scanHistory: string
  scanHistoryDesc: string
  status: string
  score: string
  columnDomain: string
  columnStep: string
}

export function ScanHistorySection({
  scans,
  t,
  dir,
}: {
  scans: any[]
  t: DashboardStrings
  dir: "rtl" | "ltr"
}) {
  const [showHistory, setShowHistory] = useState(false)

  return (
    <section
      className="overflow-hidden rounded-xl border transition-all duration-200"
      style={{
        borderColor: "#e2e8f0",
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Clickable accordion header */}
      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="flex w-full min-h-[44px] items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/80 active:bg-slate-100/80 touch-manipulation"
        style={{ direction: dir }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`}
          />
          <div>
            <h2 className="text-base font-bold text-slate-800">{t.scanHistory}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{t.scanHistoryDesc}</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-semibold"
          style={{ background: "#ede9fe", color: "#6366f1" }}
        >
          {scans.length}
        </span>
      </button>

      {/* Collapsible content with smooth animation */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: showHistory ? "2000px" : "0px",
          opacity: showHistory ? 1 : 0,
        }}
      >
        <div className="border-t px-4 pb-4 pt-2" style={{ borderColor: "#e2e8f0" }}>
          {/* Column headers */}
          <div
            className="mb-2 hidden grid-cols-[1fr_auto_auto_auto] gap-4 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:grid"
            style={{ direction: dir }}
          >
            <span>{t.columnDomain}</span>
            <span>{t.columnStep}</span>
            <span>{t.status}</span>
            <span>{t.score}</span>
          </div>

          <div className="space-y-2">
            {scans.map((s: any) => (
              <ScanHistoryRow key={s.id} s={s} locale={dir === "rtl" ? "he" : "en"} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
