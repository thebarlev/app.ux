"use client"

const STATUS_LABELS: Record<string, { he: string; en: string }> = {
  done: { he: "הושלם", en: "Done" },
  running: { he: "רץ", en: "Running" },
  pending: { he: "ממתין", en: "Pending" },
  queued: { he: "בתור", en: "Queued" },
  failed: { he: "נכשל", en: "Failed" },
}

function StatusBadge({ status, locale = "he" }: { status: string; locale?: "he" | "en" }) {
  const map: Record<string, { bg: string; dot: string; text: string }> = {
    done: { bg: "#f0fdf4", dot: "#16a34a", text: "#15803d" },
    running: { bg: "#fffbeb", dot: "#d97706", text: "#b45309" },
    pending: { bg: "#f8fafc", dot: "#64748b", text: "#475569" },
    queued: { bg: "#f8fafc", dot: "#64748b", text: "#475569" },
    failed: { bg: "#fff1f2", dot: "#e11d48", text: "#be123c" },
  }

  const m = map[status] ?? map.pending
  const label = STATUS_LABELS[status]?.[locale] ?? STATUS_LABELS.pending[locale]

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.dot}28` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {label}
    </span>
  )
}

export function ScanHistoryRow({ s, locale = "he" }: { s: any; locale?: "he" | "en" }) {
  const sr = s.report_public && typeof s.report_public === "object" ? s.report_public : {}
  const score = typeof sr.score_total === "number" ? sr.score_total : null

  const scoreColor =
    score === null ? "#94a3b8" :
    score >= 70 ? "#16a34a" :
    score >= 40 ? "#d97706" :
    "#e11d48"

  const scoreBg =
    score === null ? "#f8fafc" :
    score >= 70 ? "#f0fdf4" :
    score >= 40 ? "#fffbeb" :
    "#fff1f2"

  return (
    <div
      className="group relative overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:shadow-md hover:border-slate-200"
      style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
    >
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-[3px] rounded-l opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: "linear-gradient(to bottom, #6366f1, #34d399)" }}
      />

      <div className="flex items-center justify-between gap-4" dir={locale === "he" ? "rtl" : "ltr"}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {String(s.normalized_host || "—")}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400" dir="ltr">
            {String(s.id)}
          </p>
        </div>

        <span className="hidden shrink-0 font-mono text-[11px] text-slate-400 sm:block">
          {String(s.step)}
        </span>

        <StatusBadge status={String(s.status)} locale={locale} />

        <div
          className="flex h-9 w-14 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold"
          style={{ background: scoreBg, color: scoreColor, border: `1px solid ${scoreColor}30` }}
        >
          {score !== null ? score : "—"}
        </div>
      </div>
    </div>
  )
}