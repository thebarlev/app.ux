"use client"

import { CheckCircle, Circle, Loader2 } from "lucide-react"

type Locale = "he" | "en"

const PIPELINE_STEPS = [
  "normalize",
  "robots",
  "sitemap",
  "ai_files",
  "sample",
  "fetch_pages",
  "extract",
  "rules",
  "persist",
  "done",
] as const

type PipelineStep = (typeof PIPELINE_STEPS)[number]

const STEP_LABELS: Record<PipelineStep, { he: string; en: string }> = {
  normalize:   { he: "נרמול + SSRF",        en: "Normalize + SSRF" },
  robots:      { he: "robots.txt",           en: "robots.txt" },
  sitemap:     { he: "sitemap.xml",          en: "sitemap.xml" },
  ai_files:    { he: "קבצי AI readiness",    en: "AI readiness files" },
  sample:      { he: "דגימת עמודים",         en: "Page sampling" },
  fetch_pages: { he: "משיכת עמודים",         en: "Fetching pages" },
  extract:     { he: "חילוץ נתונים",         en: "Extracting data" },
  rules:       { he: "חוקים + ציון",         en: "Rules + scoring" },
  persist:     { he: "שמירה + סיום",         en: "Save + finish" },
  done:        { he: "הושלם",                en: "Done" },
}

/**
 * Normalize an arbitrary step string from the API.
 * – trims + lowercases
 * – if it's not in the pipeline, defaults to "normalize" so we always show
 *   at least the first step as active rather than rendering all-pending.
 */
function normalizeStep(raw: string | null | undefined): PipelineStep {
  const s = String(raw ?? "").trim().toLowerCase() as PipelineStep
  return PIPELINE_STEPS.includes(s) ? s : "normalize"
}

function getStepState(
  step: PipelineStep,
  resolvedStep: PipelineStep,
  isDone: boolean,
): "done" | "active" | "pending" {
  if (isDone) return "done"
  const currentIdx = PIPELINE_STEPS.indexOf(resolvedStep)
  const stepIdx = PIPELINE_STEPS.indexOf(step)
  if (stepIdx < currentIdx) return "done"
  if (stepIdx === currentIdx) return "active"
  return "pending"
}

function getProgress(resolvedStep: PipelineStep, isDone: boolean): number {
  if (isDone) return 100
  const idx = PIPELINE_STEPS.indexOf(resolvedStep)
  // +1 so the active step shows partial fill rather than 0 at step 0
  return Math.round(((idx + 1) / PIPELINE_STEPS.length) * 100)
}

export function ScanProgress({
  currentStep,
  isDone = false,
  locale = "he",
}: {
  currentStep: string
  isDone?: boolean
  locale?: Locale
}) {
  const isRtl = locale === "he"
  const resolved = normalizeStep(currentStep)
  const progress = getProgress(resolved, isDone)
  const progressLabel = locale === "he" ? "סריקה בתהליך" : "Scan in progress"
  const doneLabel    = locale === "he" ? "הסריקה הושלמה" : "Scan complete"

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* ── Header ── */}
      <div className={`mb-4 flex items-center justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={isRtl ? "text-right" : "text-left"}>
          <p className="text-sm font-semibold text-slate-800">
            {isDone ? doneLabel : progressLabel}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-400" dir="ltr">
            {resolved}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
          {progress}%
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Step list ── */}
      <div className="space-y-3">
        {PIPELINE_STEPS.map((step) => {
          const state = getStepState(step, resolved, isDone)
          const label = STEP_LABELS[step][locale]

          return (
            <div
              key={step}
              className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}
            >
              {state === "done" && (
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
              {state === "active" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
              )}
              {state === "pending" && (
                <Circle className="h-4 w-4 shrink-0 text-slate-300" />
              )}
              <span
                className={`text-sm ${
                  state === "done"
                    ? "text-slate-400 line-through decoration-slate-300"
                    : state === "active"
                    ? "font-semibold text-slate-800"
                    : "text-slate-400"
                }`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
