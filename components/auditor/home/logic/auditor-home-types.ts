import type { AuditorLocale } from "@/lib/auditor/locale"

/**
 * 1 domain field · 2 the scan animation · "gate" the lead form · 3 the report.
 *
 * "gate" sits between the animation and the report rather than replacing a step,
 * so a visitor arriving with ?scanId&token — who already has a link to their
 * report — still goes straight to 3.
 */
export type Step = 1 | 2 | "gate" | 3

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
      /**
       * The full count, which issues_overview is a truncated view of — the
       * status route caps that list at 12. The report needs the real number to
       * say how many issues sit behind the premium lock.
       */
      issues_count?: number | null
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
 * A scan that reached a terminal state without producing a usable score.
 *
 * Deliberately not `status === "failed"`. The common real-world case is a scan
 * that finishes cleanly with nothing to score — every page fetch blocked, so
 * the pipeline finalizes via buildMinimalReport() and leaves score_total null
 * while status reads "done". Keyed on score_ready, which the status route
 * derives from the score_total column, so the UI and the pipeline agree.
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
