import type { AuditorLocale } from "@/lib/auditor/locale"

export type Step = 1 | 2 | 3

export type StatusResponse =
  | {
      ok: true
      status: string
      step: string
      progress?: number
      score_ready?: boolean
      screenshot_url?: string | null
      score_total: number | null
      score_search: number | null
      score_ai: number | null
      category_scores: Record<string, number>
      issues_overview: string[]
      confidence_level: string | null
      warning: string | null
      done: boolean
      report_public: unknown | null
      updated_at: string
      finished_at: string | null
      hostname?: string | null
      pages_scanned?: number | null
      pages_total?: number | null
      pages_success?: number | null
      pages_failed?: number | null
    }
  | { ok: false; error: string }

/**
 * A scan that reached a terminal state (done or failed) without producing a
 * usable score — e.g. every page fetch was blocked, so the pipeline finalized
 * with buildMinimalReport() and score_total stayed null.
 *
 * Shared by AiScoreHero (renders the "no score" state) and AuditorStepTwo
 * (must not offer paid signup for a report that does not exist) so the two
 * cannot drift apart on whether the scan actually succeeded.
 */
export function isScanTerminalWithoutScore(status: StatusResponse | null): boolean {
  if (!status || status.ok !== true) return false
  const terminal = status.status === "done" || status.status === "failed"
  return terminal && status.score_ready !== true
}

export type AuditorHomeProps = {
  locale?: AuditorLocale
  basePath?: string
}
