import { SEO_AUDIT_CSV_HEADERS } from "@/lib/admin/seo-audit/types"
import type { SeoAuditResponse, SeoPageReport } from "@/lib/admin/seo-audit/types"

function escapeCsv(value: string): string {
  const normalized = String(value ?? "")
  if (/["\n,]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`
  }
  return normalized
}

function pageFlags(page: SeoPageReport): string {
  const critical = page.issues.filter((i) => i.severity === "critical").length
  const warning = page.issues.filter((i) => i.severity === "warning").length
  return `critical:${critical}|warning:${warning}`
}

export function buildSeoAuditCsv(report: SeoAuditResponse): string {
  const lines: string[] = [SEO_AUDIT_CSV_HEADERS.join(",")]
  for (const page of report.pages) {
    const row = {
      url: page.url,
      status: String(page.status),
      depth: String(page.depth),
      score_flags: pageFlags(page),
      title: page.title.value || "",
      title_length: String(page.title.length || 0),
      description: page.description.value || "",
      description_length: String(page.description.length || 0),
      h1_count: String(page.h1.count || 0),
      canonical: page.canonical.value || "",
      canonical_matches_url: page.canonical.matches_page_url ? "true" : "false",
      hreflang_count: String(page.hreflang.entries.length),
      robots_noindex: page.robots.noindex ? "true" : "false",
      schema_types: page.schemaTypes.join("|"),
      missing_alt_images: String(page.images.missing_alt),
      internal_links: String(page.internalLinks.unique_internal),
      broken_internal_links: String(page.internalLinks.broken_internal_count),
      response_time_ms: String(page.response_time_ms),
      html_size_bytes: String(page.html_size_bytes),
      issues_count: String(page.issues.length),
    } satisfies Record<(typeof SEO_AUDIT_CSV_HEADERS)[number], string>

    const values = SEO_AUDIT_CSV_HEADERS.map((header) => escapeCsv(row[header]))
    lines.push(values.join(","))
  }
  return lines.join("\n")
}

export function buildSeoAuditJson(report: SeoAuditResponse): string {
  return JSON.stringify(report, null, 2)
}
