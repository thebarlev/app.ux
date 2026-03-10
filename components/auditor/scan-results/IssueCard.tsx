"use client"

import { AlertTriangle, AlertCircle, Info } from "lucide-react"

type Severity = "ERROR" | "WARN" | "INFO"

const SEVERITY_STYLES: Record<Severity, {
  badge: string
  icon: React.ElementType
  iconClass: string
  // Uses rtl:/ltr: Tailwind variants so the accent always falls on the
  // inline-start edge regardless of which layout direction is active.
  accentBar: string
}> = {
  ERROR: {
    badge: "bg-red-100 text-red-700",
    icon: AlertCircle,
    iconClass: "text-red-500",
    accentBar: "ltr:border-l-red-400 rtl:border-r-red-400",
  },
  WARN: {
    badge: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    accentBar: "ltr:border-l-amber-400 rtl:border-r-amber-400",
  },
  INFO: {
    badge: "bg-blue-100 text-blue-700",
    icon: Info,
    iconClass: "text-blue-500",
    accentBar: "ltr:border-l-blue-400 rtl:border-r-blue-400",
  },
}

export function IssueCard({
  severity,
  text,
  dir = "auto",
}: {
  severity: Severity
  text: string
  dir?: "ltr" | "rtl" | "auto"
}) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.INFO
  const Icon = style.icon

  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md ltr:border-l-4 rtl:border-r-4 ${style.accentBar}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} />
        <p className="text-sm leading-relaxed text-slate-800" dir={dir}>
          {text}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${style.badge}`}>
        {severity}
      </span>
    </div>
  )
}
