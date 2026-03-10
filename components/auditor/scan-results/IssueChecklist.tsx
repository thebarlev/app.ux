"use client"

import { CheckCircle2 } from "lucide-react"

export function IssueChecklist({
  items,
  title,
  description,
  emptyMessage,
}: {
  items: string[]
  title: string
  description: string
  emptyMessage?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 text-start">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 text-start">{emptyMessage ?? "No items."}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0 last:pb-0"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p className="flex-1 text-sm leading-relaxed text-slate-700" dir="auto">{item}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
