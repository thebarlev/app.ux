"use client"

import type { AuditorLocale } from "@/lib/auditor/locale"

/**
 * PLACEHOLDER — awaiting the v3 mockup.
 *
 * What sits blurred behind the lead form: the shape of the report the visitor is
 * about to get, so the form reads as a door rather than an interruption. It is
 * only ever rendered blurred, decorative and aria-hidden.
 *
 * Deliberately carries no numbers. Real scores are what the visitor is being
 * asked to trade their details for, and a blur is not a security boundary — the
 * markup underneath is readable in devtools whatever the CSS says. Every value
 * here is a grey bar with nothing behind it.
 *
 * Replace the body with the v3 dashboard once the mockup lands; the gate does
 * not care what this renders, only that it fills the space.
 */

function Bar({ w }: { w: string }) {
  return <div className="h-2.5 rounded-full bg-black/10" style={{ width: w }} />
}

function CategoryRow({ label, w }: { label: string; w: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-black/40">{label}</span>
        <div className="h-3 w-8 rounded bg-black/10" />
      </div>
      <div className="h-2.5 w-full rounded-full bg-black/5">
        <div className="h-2.5 rounded-full bg-black/20" style={{ width: w }} />
      </div>
    </div>
  )
}

export function AuditorReportTeaser({ locale }: { locale: AuditorLocale }) {
  const en = locale === "en"
  const labels = en
    ? { score: "Search & AI readiness", issues: "What to improve", gaps: "What is missing" }
    : { score: "מוכנות לחיפוש ול-AI", issues: "דברים שכדאי לשפר", gaps: "מה חסר" }
  const cats = en
    ? ["Search visibility", "AI readiness", "Tracking"]
    : ["חשיפה בחיפוש", "מוכנות AI", "מדידה"]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-3">
            <span className="text-sm text-black/40">{labels.score}</span>
            <div className="h-12 w-24 rounded-lg bg-black/10" />
          </div>
          <div className="h-24 w-24 rounded-full border-8 border-black/10" />
        </div>
        <div className="mt-6 space-y-4">
          {cats.map((c, i) => (
            <CategoryRow key={c} label={c} w={["72%", "58%", "40%"][i]} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[labels.issues, labels.gaps].map((title) => (
          <div key={title} className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
            <span className="text-sm font-medium text-black/40">{title}</span>
            <div className="space-y-3 pt-1">
              {["88%", "70%", "94%", "62%"].map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-6 w-6 shrink-0 rounded-md bg-black/10" />
                  <Bar w={w} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
