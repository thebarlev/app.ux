export type AuditorScanStatus = "queued" | "running" | "done" | "failed"

export type AuditorScanStep =
  | "normalize"
  | "robots"
  | "sitemap"
  | "ai_files"
  | "sample"
  | "fetch_pages"
  | "extract"
  | "rules"
  | "persist"
  | "done"

export type AuditorRuleCategory = "technical" | "schema" | "ai_readiness" | "tracking"
export type AuditorRuleStatus = "pass" | "warn" | "fail"
export type AuditorRuleImpact = "low" | "medium" | "high"
export type AuditorRuleEffort = "low" | "medium" | "high"

