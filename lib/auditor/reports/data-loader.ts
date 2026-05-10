// Single-source data loader for the report generators.
//
// Both the customer-facing .docx report and the AI/dev-facing markdown brief
// pull from the same scan data. Centralising the load avoids drift between
// the two outputs and makes it cheap to add a third format later.

import type { SupabaseClient } from "@supabase/supabase-js"

export type FindingRow = {
  id: string
  rule_key: string
  severity: "low" | "medium" | "high" | "critical"
  status: "pass" | "warn" | "fail"
  scope: "site" | "page"
  url: string | null
  title: string
  summary: string
  recommendation: string
  evidence: Record<string, unknown>
}

export type RuleRow = {
  rule_key: string
  category: string
  status: "pass" | "warn" | "fail"
  impact: "low" | "medium" | "high"
  effort: "low" | "medium" | "high"
  weight: number
  recommendation_he: string
  evidence: Record<string, unknown>
}

export type RecommendationRow = {
  id: string
  type: string
  priority: "low" | "medium" | "high"
  title: string
  description: string
  action: string
}

export type KeywordRow = {
  keyword: string
  keyword_type: "primary" | "secondary" | "question" | "entity"
  confidence: number
}

export type TopicRow = {
  topic: string
  coverage_score: number
  missing_pages: number
}

export type PageRow = {
  url: string
  state: string
  status_code: number | null
  title: string | null
  meta_description: string | null
}

export type PSIData = {
  mobile: any
  desktop: any
}

export type GoogleSuggestData = {
  fetched_at: string
  locale: string
  total_seeds: number
  total_suggestions: number
  unique_suggestions: number
  entries: Array<{ seed: string; suggestions: string[] }>
}

export type ReportData = {
  scan: {
    id: string
    target_url: string
    hostname: string | null
    normalized_host: string | null
    status: string
    score_total: number | null
    score_breakdown: Record<string, number | null>
    coverage: { total_pages?: number; extracted_pages?: number }
    confidence: { level?: string; warning?: string }
    created_at: string
    finished_at: string | null
    page_limit: number | null
  }
  pages: PageRow[]
  rules: RuleRow[]
  findings: FindingRow[]
  recommendations: RecommendationRow[]
  keywords: KeywordRow[]
  topics: TopicRow[]
  pagespeed: PSIData | null
  google_suggest: GoogleSuggestData | null
}

export async function loadReportData(params: {
  supabase: SupabaseClient
  scanId: string
}): Promise<ReportData | null> {
  const { supabase, scanId } = params

  const { data: scan, error: scanErr } = await supabase
    .from("auditor_scans")
    .select("*")
    .eq("id", scanId)
    .maybeSingle()

  if (scanErr || !scan) return null

  const [
    { data: pages },
    { data: rules },
    { data: findings },
    { data: recommendations },
    { data: keywords },
    { data: topics },
  ] = await Promise.all([
    supabase
      .from("auditor_scan_pages")
      .select("url,state,status_code,title,meta_description")
      .eq("scan_id", scanId)
      .order("url"),
    supabase
      .from("auditor_scan_rules")
      .select("rule_key,category,status,impact,effort,weight,recommendation_he,evidence")
      .eq("scan_id", scanId)
      .order("status", { ascending: true }),
    supabase
      .from("auditor_scan_findings")
      .select("id,rule_key,severity,status,scope,url,title,summary,recommendation,evidence")
      .eq("scan_id", scanId)
      .order("severity"),
    supabase
      .from("auditor_recommendations")
      .select("id,type,priority,title,description,action")
      .eq("scan_id", scanId)
      .order("priority", { ascending: false }),
    supabase
      .from("auditor_keywords")
      .select("keyword,keyword_type,confidence")
      .eq("scan_id", scanId)
      .order("confidence", { ascending: false })
      .limit(200),
    supabase
      .from("auditor_topics")
      .select("topic,coverage_score,missing_pages")
      .eq("scan_id", scanId)
      .order("coverage_score", { ascending: false })
      .limit(50),
  ])

  const artifacts = (scan.artifacts as Record<string, any>) || {}
  const score_breakdown = (scan.score_breakdown as Record<string, number | null>) || {}
  const coverage = (scan.coverage as Record<string, number>) || {}
  const confidence = (scan.confidence as Record<string, string>) || {}

  return {
    scan: {
      id: scan.id,
      target_url: scan.target_url || "",
      hostname: scan.hostname,
      normalized_host: scan.normalized_host,
      status: scan.status,
      score_total: typeof scan.score_total === "number" ? scan.score_total : null,
      score_breakdown,
      coverage,
      confidence,
      created_at: scan.created_at,
      finished_at: scan.finished_at,
      page_limit: typeof scan.page_limit === "number" ? scan.page_limit : null,
    },
    pages: (pages || []) as PageRow[],
    rules: (rules || []) as RuleRow[],
    findings: (findings || []) as FindingRow[],
    recommendations: (recommendations || []) as RecommendationRow[],
    keywords: (keywords || []) as KeywordRow[],
    topics: (topics || []) as TopicRow[],
    pagespeed: artifacts.pagespeed && typeof artifacts.pagespeed === "object" ? artifacts.pagespeed : null,
    google_suggest: artifacts.google_suggest && typeof artifacts.google_suggest === "object" ? artifacts.google_suggest : null,
  }
}

// ─── helpers used by both report generators ─────────────────────────────────

export function severityWeight(s: string): number {
  switch (s) {
    case "critical":
      return 4
    case "high":
      return 3
    case "medium":
      return 2
    case "low":
      return 1
    default:
      return 0
  }
}

export function topFindings(findings: FindingRow[], limit: number = 5): FindingRow[] {
  // Filter out PSI-sourced findings on perfectly-passing audits (rare but possible).
  const failing = findings.filter((f) => f.status === "fail" || f.status === "warn")
  failing.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
  return failing.slice(0, limit)
}

export function passingHighlights(rules: RuleRow[], limit: number = 5): RuleRow[] {
  return rules
    .filter((r) => r.status === "pass" && r.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
}

export function formatHebrewDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export function gradeFromScore(score: number | null): {
  label: string
  color: "red" | "orange" | "yellow" | "green"
  hex: string
} {
  if (score === null || !Number.isFinite(score)) {
    return { label: "—", color: "yellow", hex: "9ca3af" }
  }
  if (score >= 90) return { label: "מצוין", color: "green", hex: "16a34a" }
  if (score >= 75) return { label: "טוב", color: "green", hex: "65a30d" }
  if (score >= 50) return { label: "בינוני", color: "yellow", hex: "ca8a04" }
  if (score >= 25) return { label: "חלש", color: "orange", hex: "ea580c" }
  return { label: "חמור", color: "red", hex: "dc2626" }
}
