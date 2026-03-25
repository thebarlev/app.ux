import type { SeoIssue, SeoPageReport, SeoScoreBreakdown } from "@/lib/admin/seo-audit/types"

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function countBySeverity(issues: SeoIssue[]) {
  let critical = 0
  let warning = 0
  for (const issue of issues) {
    if (issue.severity === "critical") critical += 1
    else if (issue.severity === "warning") warning += 1
  }
  return { critical, warning }
}

export function computeSeoScore(params: {
  pages: SeoPageReport[]
  globalIssues: SeoIssue[]
}): { score: number; breakdown: SeoScoreBreakdown } {
  const pageIssues = params.pages.flatMap((page) => page.issues)
  const allIssues = [...pageIssues, ...params.globalIssues]
  const sev = countBySeverity(allIssues)

  const avgResponse = params.pages.length
    ? params.pages.reduce((sum, p) => sum + p.response_time_ms, 0) / params.pages.length
    : 0
  const avgHtmlSize = params.pages.length
    ? params.pages.reduce((sum, p) => sum + p.html_size_bytes, 0) / params.pages.length
    : 0

  let technical = 30
  let content = 30
  let structure = 20
  let performance = 20

  technical -= sev.critical * 2.2 + sev.warning * 0.7

  const contentPenalties = params.pages.reduce((acc, page) => {
    let p = 0
    if (!page.title.exists) p += 1.2
    if (!page.description.exists) p += 1
    if (page.h1.count === 0) p += 1
    if (page.images.missing_alt > 0) p += Math.min(1, page.images.missing_alt / 15)
    if (page.schemaTypes.length === 0) p += 0.4
    return acc + p
  }, 0)
  content -= contentPenalties

  const structurePenalties = params.pages.reduce((acc, page) => {
    let p = 0
    if (!page.canonical.exists) p += 0.6
    if (!page.canonical.matches_page_url) p += 0.4
    if (page.depth > 3) p += 0.4
    if (page.internalLinks.broken_internal_count > 0) p += 0.7
    return acc + p
  }, 0)
  structure -= structurePenalties

  if (avgResponse > 1200) performance -= 2
  if (avgResponse > 2000) performance -= 3
  if (avgResponse > 3500) performance -= 4
  if (avgHtmlSize > 500_000) performance -= 2
  if (avgHtmlSize > 900_000) performance -= 3
  performance -= params.pages.reduce((acc, p) => acc + (p.status >= 400 ? 0.8 : 0), 0)

  technical = clamp(technical, 0, 30)
  content = clamp(content, 0, 30)
  structure = clamp(structure, 0, 20)
  performance = clamp(performance, 0, 20)

  const score = Math.round(technical + content + structure + performance)
  return {
    score,
    breakdown: {
      technical: Math.round(technical),
      content: Math.round(content),
      structure: Math.round(structure),
      performance: Math.round(performance),
    },
  }
}
