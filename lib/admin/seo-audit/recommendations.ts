import type {
  SeoActionableRecommendation,
  SeoBusinessImpact,
  SeoFixComplexity,
  SeoGrowthOpportunity,
  SeoIssue,
  SeoPageReport,
  SeoRecommendationGroup,
  SeoRecommendationSeverity,
} from "@/lib/admin/seo-audit/types"

type Rule = {
  issueLabel: string
  group: SeoRecommendationGroup
  severity: SeoRecommendationSeverity
  impact: SeoBusinessImpact
  devComplexity: SeoFixComplexity
  whyItMatters: string
  howToFix: string
}

const RULES_BY_CODE: Record<string, Rule> = {
  title_missing: {
    issueLabel: "Missing title tags",
    group: "Content improvements",
    severity: "high",
    impact: "high",
    devComplexity: "low",
    whyItMatters: "Pages without title tags lose CTR and relevance signals in search results.",
    howToFix:
      "Add page-specific metadata using Next.js `generateMetadata` in each route file. Keep titles unique and aligned with intent.",
  },
  description_missing: {
    issueLabel: "Missing meta descriptions",
    group: "Content improvements",
    severity: "medium",
    impact: "high",
    devComplexity: "low",
    whyItMatters: "Meta descriptions improve click-through rate and snippet quality.",
    howToFix:
      "Set `description` in Next.js metadata per route (`generateMetadata` or exported `metadata` object). Target 120-160 chars.",
  },
  canonical_missing: {
    issueLabel: "Missing canonical tags",
    group: "Technical SEO fixes",
    severity: "high",
    impact: "high",
    devComplexity: "medium",
    whyItMatters: "Missing canonicals can split ranking signals across duplicate URLs.",
    howToFix:
      "Define canonical URL via metadata alternates in Next.js (`alternates.canonical`) at page level.",
  },
  canonical_mismatch: {
    issueLabel: "Canonical URL mismatch",
    group: "Technical SEO fixes",
    severity: "high",
    impact: "high",
    devComplexity: "medium",
    whyItMatters: "Incorrect canonical tags can de-index the intended URL.",
    howToFix:
      "Update canonical targets to point to the current preferred URL and ensure trailing-slash/domain consistency.",
  },
  canonical_duplicate: {
    issueLabel: "Duplicate canonical targets",
    group: "Technical SEO fixes",
    severity: "medium",
    impact: "medium",
    devComplexity: "medium",
    whyItMatters: "Multiple pages canonicalizing to one URL may suppress valid pages.",
    howToFix:
      "Set canonical per route dynamically so each page points to itself unless intentional consolidation is needed.",
  },
  h1_missing: {
    issueLabel: "Missing H1 headings",
    group: "Structure & linking",
    severity: "medium",
    impact: "medium",
    devComplexity: "low",
    whyItMatters: "Missing H1 reduces topical clarity for crawlers and users.",
    howToFix:
      "Add one descriptive `<h1>` in the page component, aligned to title and primary query intent.",
  },
  h1_multiple: {
    issueLabel: "Multiple H1 headings",
    group: "Structure & linking",
    severity: "medium",
    impact: "medium",
    devComplexity: "low",
    whyItMatters: "Multiple H1s can dilute primary topic signals.",
    howToFix:
      "Keep one main `<h1>` per page and move additional section headings to `<h2>/<h3>`.",
  },
  images_missing_alt: {
    issueLabel: "Images missing alt text",
    group: "Content improvements",
    severity: "low",
    impact: "medium",
    devComplexity: "low",
    whyItMatters: "Missing alt text hurts accessibility and image search discoverability.",
    howToFix:
      "Add meaningful `alt` values to content images. For decorative assets, use empty alt explicitly (`alt=''`).",
  },
  important_noindex: {
    issueLabel: "Important pages marked noindex",
    group: "Technical SEO fixes",
    severity: "critical",
    impact: "high",
    devComplexity: "low",
    whyItMatters: "Noindex on money pages directly blocks organic visibility and revenue.",
    howToFix:
      "Remove `noindex` from metadata robots config on business-critical pages (`metadata.robots` or route-level head settings).",
  },
  hreflang_invalid: {
    issueLabel: "Invalid hreflang structure",
    group: "Technical SEO fixes",
    severity: "high",
    impact: "medium",
    devComplexity: "medium",
    whyItMatters: "Invalid hreflang can cause wrong locale ranking and cannibalization.",
    howToFix:
      "Use Next.js metadata alternates languages map and valid locale codes (e.g. `he-IL`, `en`).",
  },
  hreflang_no_reciprocal: {
    issueLabel: "Hreflang without reciprocal links",
    group: "Technical SEO fixes",
    severity: "high",
    impact: "medium",
    devComplexity: "medium",
    whyItMatters: "Search engines may ignore hreflang clusters without reciprocity.",
    howToFix:
      "Ensure each localized page references every sibling locale and each sibling references back.",
  },
  internal_broken_links: {
    issueLabel: "Broken internal links",
    group: "Structure & linking",
    severity: "high",
    impact: "high",
    devComplexity: "medium",
    whyItMatters: "Broken links waste crawl budget and weaken internal authority flow.",
    howToFix:
      "Fix broken href targets in templates/components and update route changes to avoid stale links.",
  },
  title_duplicate: {
    issueLabel: "Duplicate page titles",
    group: "Content improvements",
    severity: "medium",
    impact: "high",
    devComplexity: "low",
    whyItMatters: "Duplicate titles reduce query targeting and SERP differentiation.",
    howToFix:
      "Generate unique titles by page type and intent in route-level metadata.",
  },
  description_duplicate: {
    issueLabel: "Duplicate meta descriptions",
    group: "Content improvements",
    severity: "low",
    impact: "medium",
    devComplexity: "low",
    whyItMatters: "Duplicate descriptions reduce snippet relevance across pages.",
    howToFix:
      "Write distinct descriptions for each high-value page and template dynamic values where possible.",
  },
  sitemap_url_404: {
    issueLabel: "Sitemap contains 404 URLs",
    group: "Technical SEO fixes",
    severity: "critical",
    impact: "high",
    devComplexity: "medium",
    whyItMatters: "Invalid sitemap URLs send negative quality signals and waste crawl capacity.",
    howToFix:
      "Regenerate sitemap from live route inventory and remove non-existing URLs before deployment.",
  },
  sitemap_contains_blocked_pattern: {
    issueLabel: "Sitemap includes utility/blocked URLs",
    group: "Technical SEO fixes",
    severity: "high",
    impact: "medium",
    devComplexity: "low",
    whyItMatters: "Indexing checkout/account URLs can pollute index quality.",
    howToFix:
      "Exclude utility patterns from sitemap generation and add noindex where appropriate.",
  },
}

function toPathname(url: string): string {
  try {
    return new URL(url).pathname || "/"
  } catch {
    return "/"
  }
}

function toSuggestedFile(url: string): string {
  const pathname = toPathname(url)
  if (pathname === "/") return "app/page.tsx"
  const clean = pathname.replace(/^\/+|\/+$/g, "")
  return `app/${clean}/page.tsx`
}

function priorityWeight(value: SeoRecommendationSeverity): number {
  if (value === "critical") return 4
  if (value === "high") return 3
  if (value === "medium") return 2
  return 1
}

function impactWeight(value: SeoBusinessImpact): number {
  if (value === "high") return 3
  if (value === "medium") return 2
  return 1
}

function detectMoneyPage(url: string): boolean {
  const p = toPathname(url).toLowerCase()
  return p === "/" || p === "/seo-ai" || p === "/en/seo-ai" || p.includes("service") || p.includes("landing")
}

export function buildActionableRecommendations(params: {
  pages: SeoPageReport[]
  globalIssues: SeoIssue[]
}): {
  recommendations: SeoActionableRecommendation[]
  growthOpportunities: SeoGrowthOpportunity[]
  quickWins: SeoActionableRecommendation[]
  biggestIssues: SeoActionableRecommendation[]
} {
  const issuesByCode = new Map<string, { issue: SeoIssue; pages: SeoPageReport[]; globalCount: number }>()
  for (const page of params.pages) {
    for (const issue of page.issues) {
      const bucket = issuesByCode.get(issue.code) || { issue, pages: [], globalCount: 0 }
      bucket.pages.push(page)
      issuesByCode.set(issue.code, bucket)
    }
  }
  for (const issue of params.globalIssues) {
    const bucket = issuesByCode.get(issue.code) || { issue, pages: [], globalCount: 0 }
    bucket.globalCount += 1
    issuesByCode.set(issue.code, bucket)
  }

  const recommendations: SeoActionableRecommendation[] = []
  const moneyPriorityByIssue = new Map<string, number>()
  for (const [code, bucket] of issuesByCode) {
    const rule = RULES_BY_CODE[code]
    if (!rule) continue

    const samplePage = bucket.pages[0]?.url || ""
    const moneyPageCount = bucket.pages.filter((p) => p.isMoneyPage || detectMoneyPage(p.url)).length
    const affectedPages = Math.max(bucket.pages.length, bucket.globalCount)
    const fileHint = samplePage ? toSuggestedFile(samplePage) : "app/layout.tsx"
    const exampleFix = samplePage
      ? `Example from scan: ${toPathname(samplePage)}. Suggested Next.js fix in ${fileHint} using generateMetadata/metadata to address ${rule.issueLabel.toLowerCase()}.`
      : `Site-level issue detected. Suggested Next.js fix in app/layout.tsx or sitemap generator config.`

    let severity = rule.severity
    let impact = rule.impact
    if (moneyPageCount > 0 && severity !== "critical") severity = "high"
    if (moneyPageCount > 0 && impact !== "high") impact = "high"
    moneyPriorityByIssue.set(rule.issueLabel, moneyPageCount)

    recommendations.push({
      issue: rule.issueLabel,
      severity,
      affectedPages,
      whyItMatters: rule.whyItMatters,
      howToFix: rule.howToFix,
      exampleFix,
      devComplexity: rule.devComplexity,
      impact,
      group: rule.group,
    })
  }

  recommendations.sort((a, b) => {
    const aMoney = moneyPriorityByIssue.get(a.issue) || 0
    const bMoney = moneyPriorityByIssue.get(b.issue) || 0
    const aScore = aMoney * 100 + impactWeight(a.impact) * 30 + priorityWeight(a.severity) * 20 + a.affectedPages
    const bScore = bMoney * 100 + impactWeight(b.impact) * 30 + priorityWeight(b.severity) * 20 + b.affectedPages
    return bScore - aScore
  })

  const growthOpportunities: SeoGrowthOpportunity[] = []
  const weakMoneyPages = params.pages.filter((p) => p.isMoneyPage && (p.issues.length >= 2 || !p.description.exists || p.schemaTypes.length === 0))
  if (weakMoneyPages.length > 0) {
    growthOpportunities.push({
      title: "Money pages have ranking upside with foundational optimization",
      rationale: "High-value pages were found with missing metadata/schema or multiple SEO issues.",
      affectedPages: weakMoneyPages.length,
      opportunityScore: Math.min(100, 60 + weakMoneyPages.length * 8),
      suggestedAction: "Prioritize metadata + schema + internal linking updates for revenue-oriented pages first.",
      examples: weakMoneyPages.slice(0, 3).map((p) => toPathname(p.url)),
    })
  }

  const lowLinkedImportantPages = params.pages.filter((p) => p.isMoneyPage && p.internalLinks.unique_internal < 3)
  if (lowLinkedImportantPages.length > 0) {
    growthOpportunities.push({
      title: "Important pages are weakly linked internally",
      rationale: "Money pages with low internal-link support can underperform despite good content.",
      affectedPages: lowLinkedImportantPages.length,
      opportunityScore: Math.min(100, 55 + lowLinkedImportantPages.length * 10),
      suggestedAction: "Add contextual links from blog/service hubs to these pages with relevant anchor text.",
      examples: lowLinkedImportantPages.slice(0, 3).map((p) => toPathname(p.url)),
    })
  }

  const noSchemaOnKeyPages = params.pages.filter((p) => p.isMoneyPage && p.schemaTypes.length === 0)
  if (noSchemaOnKeyPages.length > 0) {
    growthOpportunities.push({
      title: "Key pages missing structured data",
      rationale: "Schema on high-intent pages can improve eligibility for rich search features.",
      affectedPages: noSchemaOnKeyPages.length,
      opportunityScore: Math.min(100, 50 + noSchemaOnKeyPages.length * 10),
      suggestedAction: "Add Organization/Service/FAQ schema in page components or shared SEO helpers.",
      examples: noSchemaOnKeyPages.slice(0, 3).map((p) => toPathname(p.url)),
    })
  }

  const quickWins = recommendations
    .filter((r) => r.devComplexity === "low" && r.impact === "high")
    .slice(0, 5)

  const biggestIssues = recommendations.slice(0, 3)

  return {
    recommendations,
    growthOpportunities,
    quickWins,
    biggestIssues,
  }
}
