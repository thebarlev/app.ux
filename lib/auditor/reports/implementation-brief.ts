// Implementation Brief — generated from scan data, output as Markdown.
//
// Audience: AI assistant or human developer that will perform the fixes.
// Tone: technical, prescriptive, exhaustive.
//
// Ground rules:
// - Every finding gets concrete remediation steps (when we have them).
// - PSI-sourced findings include the actual Lighthouse audit ID so the
//   developer can look up the canonical fix on web.dev.
// - Page-level data (URL, title, meta description) is included so the
//   developer can locate the file to edit.

import type { ReportData } from "./data-loader"
import { formatHebrewDate, severityWeight } from "./data-loader"

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
}

const SEVERITY_LABEL_EN: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
}

function header(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}\n\n`
}

function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n") + "\n\n"
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n")
  return head + "\n" + body + "\n\n"
}

function section(title: string, body: string): string {
  return `${header(2, title)}${body}`
}

function detectStack(data: ReportData): string[] {
  const detected: string[] = []
  const tracking = data.pages.find((p) => true) // first page
  // Soft heuristics — we'll improve later.
  if (data.scan.target_url.includes("vercel")) detected.push("Hosted on Vercel (URL hint)")
  return detected
}

// ─── Per-section generators ─────────────────────────────────────────────────

function siteProfile(data: ReportData): string {
  const lines = [
    `- **URL:** ${data.scan.target_url}`,
    `- **Hostname:** ${data.scan.hostname || data.scan.normalized_host || "—"}`,
    `- **Pages crawled:** ${data.scan.coverage?.total_pages ?? data.pages.length}`,
    `- **Pages successfully extracted:** ${data.scan.coverage?.extracted_pages ?? "—"}`,
    `- **Scan completed:** ${data.scan.finished_at ? formatHebrewDate(data.scan.finished_at) : "in progress"}`,
    `- **Confidence level:** ${data.scan.confidence?.level || "—"}`,
  ]
  const stack = detectStack(data)
  if (stack.length > 0) {
    lines.push(`- **Detected stack:** ${stack.join(", ")}`)
  }
  return bulletList(lines)
}

function performanceTargets(data: ReportData): string {
  if (!data.pagespeed || (!data.pagespeed.mobile && !data.pagespeed.desktop)) {
    return "_PageSpeed Insights data not available for this scan._\n\n"
  }
  const headers = ["Metric", "Mobile", "Desktop", "Target", "Priority"]
  const rows: string[][] = []

  const m = data.pagespeed.mobile
  const d = data.pagespeed.desktop

  if (m?.scores || d?.scores) {
    rows.push([
      "Performance score",
      m?.scores?.performance ?? "—",
      d?.scores?.performance ?? "—",
      "≥ 85",
      "HIGH",
    ])
    rows.push([
      "Accessibility score",
      m?.scores?.accessibility ?? "—",
      d?.scores?.accessibility ?? "—",
      "≥ 95",
      "HIGH",
    ])
    rows.push([
      "Best Practices score",
      m?.scores?.best_practices ?? "—",
      d?.scores?.best_practices ?? "—",
      "≥ 95",
      "MEDIUM",
    ])
    rows.push([
      "SEO score",
      m?.scores?.seo ?? "—",
      d?.scores?.seo ?? "—",
      "≥ 95",
      "HIGH",
    ])
  }

  if (m?.cwv || d?.cwv) {
    const formatMs = (v: number | null | undefined) =>
      typeof v === "number" ? `${Math.round(v)} ms` : "—"
    const formatNum = (v: number | null | undefined) =>
      typeof v === "number" ? v.toFixed(3) : "—"
    rows.push(["LCP (Largest Contentful Paint)", formatMs(m?.cwv?.lcp_ms), formatMs(d?.cwv?.lcp_ms), "< 2500 ms", "HIGH"])
    rows.push(["CLS (Cumulative Layout Shift)", formatNum(m?.cwv?.cls), formatNum(d?.cwv?.cls), "< 0.1", "MEDIUM"])
    rows.push(["INP (Interaction to Next Paint)", formatMs(m?.cwv?.inp_ms), formatMs(d?.cwv?.inp_ms), "< 200 ms", "MEDIUM"])
    rows.push(["FCP (First Contentful Paint)", formatMs(m?.cwv?.fcp_ms), formatMs(d?.cwv?.fcp_ms), "< 1800 ms", "LOW"])
    rows.push(["TBT (Total Blocking Time)", formatMs(m?.cwv?.tbt_ms), formatMs(d?.cwv?.tbt_ms), "< 200 ms", "MEDIUM"])
  }

  return rows.length === 0
    ? "_No PSI metrics returned._\n\n"
    : table(headers, rows.map((r) => r.map((c) => String(c))))
}

function findingsSection(data: ReportData): string {
  if (data.findings.length === 0) {
    return "_No findings persisted for this scan._\n\n"
  }

  const sorted = [...data.findings].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
  const blocks: string[] = []

  let idx = 1
  for (const f of sorted) {
    const evidence = f.evidence || {}
    const isPsi = String(f.rule_key).startsWith("psi.")
    const auditId = (evidence as any).audit_id
    const score = (evidence as any).score
    const strategy = (evidence as any).strategy

    blocks.push(`### ${idx}. ${SEVERITY_EMOJI[f.severity] || ""} [${SEVERITY_LABEL_EN[f.severity]}] ${f.title}`)
    blocks.push("")
    blocks.push(`- **Source:** ${isPsi ? `Google PSI (${strategy || "?"})` : `Auditor rule \`${f.rule_key}\``}`)
    if (auditId) blocks.push(`- **Lighthouse audit ID:** \`${auditId}\``)
    if (typeof score === "number") blocks.push(`- **Lighthouse score:** ${score}/100`)
    if (f.url) blocks.push(`- **URL:** ${f.url}`)
    blocks.push(`- **Scope:** ${f.scope}`)
    blocks.push("")
    blocks.push(`**Issue:**`)
    blocks.push(f.summary || f.title)
    blocks.push("")
    blocks.push(`**Recommendation:**`)
    blocks.push(f.recommendation || "—")
    blocks.push("")
    if (isPsi && auditId) {
      blocks.push(`**Reference:** https://web.dev/${auditId}/`)
      blocks.push("")
    }
    blocks.push(`**Verification:**`)
    blocks.push(
      isPsi
        ? `Re-run PSI on ${f.url || data.scan.target_url} (${strategy || "both"}) — expect score ≥ 90 on this audit.`
        : "Re-run the Auditor scan and confirm this rule shows status `pass`."
    )
    blocks.push("")
    blocks.push("---")
    blocks.push("")
    idx += 1
  }

  return blocks.join("\n")
}

function keywordsSection(data: ReportData): string {
  if (data.keywords.length === 0) return "_No keywords extracted._\n\n"

  const primary = data.keywords.filter((k) => k.keyword_type === "primary")
  const secondary = data.keywords.filter((k) => k.keyword_type === "secondary")
  const questions = data.keywords.filter((k) => k.keyword_type === "question")
  const entities = data.keywords.filter((k) => k.keyword_type === "entity")

  const blocks: string[] = []

  if (primary.length > 0) {
    blocks.push("### Primary keywords (top targets)")
    blocks.push(bulletList(primary.slice(0, 15).map((k) => `\`${k.keyword}\` (confidence ${(k.confidence * 100).toFixed(0)}%)`)))
  }
  if (secondary.length > 0) {
    blocks.push("### Secondary keywords")
    blocks.push(bulletList(secondary.slice(0, 20).map((k) => `\`${k.keyword}\``)))
  }
  if (questions.length > 0) {
    blocks.push("### Question-style keywords (FAQ candidates)")
    blocks.push(bulletList(questions.slice(0, 10).map((k) => k.keyword)))
  }
  if (entities.length > 0) {
    blocks.push("### Entities mentioned in content")
    blocks.push(bulletList(entities.slice(0, 15).map((k) => `\`${k.keyword}\``)))
  }

  return blocks.join("\n")
}

function googleSuggestSection(data: ReportData): string {
  if (!data.google_suggest || data.google_suggest.entries.length === 0) {
    return "_Google Suggest data not available._\n\n"
  }

  const lines: string[] = [
    `Total seeds queried: **${data.google_suggest.total_seeds}**`,
    `Total suggestions returned: **${data.google_suggest.total_suggestions}**`,
    `Unique suggestions: **${data.google_suggest.unique_suggestions}**`,
    "",
    "These represent what real users type into Google Search around the site's content topics. Each one is a potential page idea or H1 to target.",
    "",
  ]

  for (const entry of data.google_suggest.entries) {
    if (entry.suggestions.length === 0) continue
    lines.push(`**Seed:** \`${entry.seed}\``)
    for (const s of entry.suggestions) {
      lines.push(`- ${s}`)
    }
    lines.push("")
  }

  return lines.join("\n") + "\n"
}

function topicsSection(data: ReportData): string {
  if (data.topics.length === 0) return "_No topics derived._\n\n"
  const headers = ["Topic", "Coverage score", "Missing pages"]
  const rows = data.topics.slice(0, 20).map((t) => [
    t.topic,
    String(t.coverage_score),
    String(t.missing_pages),
  ])
  return table(headers, rows)
}

function pagesSection(data: ReportData): string {
  if (data.pages.length === 0) return "_No pages crawled._\n\n"

  const headers = ["URL", "State", "Status", "Title", "Meta description"]
  const rows = data.pages.map((p) => [
    p.url,
    p.state,
    p.status_code != null ? String(p.status_code) : "—",
    p.title || "—",
    p.meta_description || "—",
  ])
  return table(headers, rows.map((r) => r.map((c) => c.replace(/\|/g, "\\|"))))
}

function recommendationsSection(data: ReportData): string {
  if (data.recommendations.length === 0) return "_No automated recommendations available._\n\n"

  const sorted = [...data.recommendations].sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 } as const
    return (order[b.priority] || 0) - (order[a.priority] || 0)
  })

  const blocks: string[] = []
  let idx = 1
  for (const r of sorted) {
    blocks.push(`### ${idx}. [${r.priority.toUpperCase()}] ${r.title}`)
    blocks.push("")
    blocks.push(`**Type:** ${r.type}`)
    blocks.push("")
    blocks.push(`**Description:** ${r.description}`)
    blocks.push("")
    blocks.push(`**Action:** ${r.action}`)
    blocks.push("")
    blocks.push("---")
    blocks.push("")
    idx += 1
  }

  return blocks.join("\n")
}

// ─── Public entry point ─────────────────────────────────────────────────────

export function buildImplementationBrief(data: ReportData): string {
  const parts: string[] = []
  const host = data.scan.normalized_host || data.scan.hostname || "site"

  parts.push(header(1, `Implementation Brief: ${host}`))
  parts.push(
    "_Generated automatically from VOW Auditor scan data. This document is meant to be passed to an AI assistant or developer to drive concrete fixes._"
  )
  parts.push("")
  parts.push("---")
  parts.push("")

  parts.push(section("Site Profile", siteProfile(data)))
  parts.push(section("Performance Targets", performanceTargets(data)))
  parts.push(section("Findings to Fix", findingsSection(data)))
  parts.push(section("Recommendations (auto-derived)", recommendationsSection(data)))
  parts.push(section("Keywords Detected", keywordsSection(data)))
  parts.push(section("Google Suggest expansions", googleSuggestSection(data)))
  parts.push(section("Topic Coverage", topicsSection(data)))
  parts.push(section("Pages Crawled", pagesSection(data)))

  parts.push("---")
  parts.push("")
  parts.push("_End of brief. Each finding is independently actionable; tackle in priority order._")
  parts.push("")

  return parts.join("\n")
}
