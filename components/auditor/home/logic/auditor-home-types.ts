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

export type AuditorHomeProps = {
  locale?: AuditorLocale
  basePath?: string
}
