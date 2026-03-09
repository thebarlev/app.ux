export type ConfidenceLevel = "high" | "medium" | "low"

export type PublicReport = {
  score_total: number
  score_search: number
  score_ai: number
  category_scores: Record<string, number>
  issues_overview: string[]
  confidence_level: ConfidenceLevel
  warning?: string
  next_steps_cta?: string
}

const RULE_TO_PUBLIC_ISSUE: Record<string, string> = {
  "tech.robots_block_all": "robots.txt חוסם סריקה — מנועי חיפוש וכלי AI לא יוכלו לקרוא את האתר.",
  "tech.noindex_present": "האתר מסומן כ-Noindex — ייתכן שגוגל/בוטים לא יציגו את האתר בתוצאות.",
  "tech.https_enforced": "אין אכיפה עקבית של HTTPS — מומלץ לייצב הפניות וגרסה ראשית אחת.",
  "tech.canonical_host_match": "Canonical לא עקבי — עלול לגרום לכפילויות ופגיעה בדירוג.",
  "tech.sitemap_present": "חסר sitemap.xml תקין — אינדוקס יכול להיות חלקי.",
  "tech.robots_txt_present": "חסר robots.txt או שהוא לא נגיש — מומלץ להוסיף הגדרות סריקה בסיסיות.",
  "onpage.viewport_present": "חסר meta viewport — חוויית מובייל עלולה להיפגע.",
  "onpage.single_h1": "מבנה כותרות בעמודים לא עקבי (H1) — מומלץ לשפר היררכיה.",
  "onpage.images_alt": "חסרים טקסטים חלופיים (alt) לתמונות — פוגע בנגישות וב-SEO.",
  "schema.faq_or_article": "חסרה סכמה מתאימה (FAQ/Article) בעמודים רלוונטיים — מקשה על AI לחלץ תשובות.",
  "ai.llms_txt_present": "חסר קובץ llms.txt — מומלץ כדי לשפר קריאות ל-AI.",
}

/** English translations for EN locale (LTR) */
export const RULE_KEY_TO_EN: Record<string, string> = {
  "tech.robots_block_all": "robots.txt blocks crawling — search engines and AI tools cannot read the site.",
  "tech.noindex_present": "Site is marked Noindex — Google/bots may not show the site in results.",
  "tech.https_enforced": "No consistent HTTPS enforcement — recommend standardizing redirects to secure version.",
  "tech.canonical_host_match": "Canonical is inconsistent — may cause duplicates and hurt ranking.",
  "tech.sitemap_present": "Valid sitemap.xml is missing — indexing may be partial.",
  "tech.robots_txt_present": "robots.txt is missing or inaccessible — add basic crawl directives.",
  "tech.title_present": "Add a unique, clear title tag to the homepage (30–60 chars preferred).",
  "tech.meta_description_present": "Add a quality meta description (120–160 chars) that explains the site value.",
  "tech.canonical_present": "Add canonical to reduce duplicates and clarify the primary URL.",
  "tech.html_lang_present": "Set lang on the <html> tag (e.g. he/en) to improve SEO and accessibility.",
  "onpage.viewport_present": "Meta viewport is missing — mobile experience may suffer.",
  "onpage.single_h1": "Heading structure is inconsistent (H1) — improve hierarchy.",
  "onpage.images_alt": "Missing alt text for images — hurts accessibility and SEO.",
  "schema.jsonld_present": "Add Schema.org via JSON-LD (at least Organization and WebSite).",
  "schema.org_or_website_type": "Add or strengthen Organization and/or WebSite JSON-LD on the homepage.",
  "schema.faq_or_article": "Suitable schema (FAQ/Article) is missing on relevant pages — makes it harder for AI to extract answers.",
  "ai.llms_txt_present": "llms.txt file is missing — recommended to improve AI readability.",
  "ai.well_known_ai_json_present": "Add /.well-known/ai.json (if relevant) for AI crawlers.",
  "ai.brand_json_present": "Add a basic /brand.json with brand details for automated tools.",
  "tracking.gtm_present": "Implement Google Tag Manager for analytics/events.",
  "tracking.ga4_present": "Implement GA4 to measure traffic, conversions, and acquisition.",
  "tracking.social_meta_present": "Add OpenGraph and Twitter tags to improve sharing display.",
}

function clampScore(n: any): number {
  const x = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

export function buildPublicReport(params: {
  score_total: number
  score_search: number
  score_ai: number
  category_scores: Record<string, number>
  findings: Array<{ rule_key: string; severity: string; status: string }>
  confidence_level: ConfidenceLevel
  warning?: string
}): PublicReport & { issues_overview_en?: string[] } {
  const failWarn = params.findings.filter((f) => f.status === "fail" || f.status === "warn")
  const issues = failWarn.map((f) => RULE_TO_PUBLIC_ISSUE[f.rule_key]).filter(Boolean)
  const issuesEn = failWarn.map((f) => RULE_KEY_TO_EN[f.rule_key]).filter(Boolean)
  const issuesUnique = Array.from(new Set(issues)).slice(0, 12)
  const issuesUniqueEn = Array.from(new Set(issuesEn)).slice(0, 12)

  return {
    score_total: clampScore(params.score_total),
    score_search: clampScore(params.score_search),
    score_ai: clampScore(params.score_ai),
    category_scores: Object.fromEntries(Object.entries(params.category_scores || {}).map(([k, v]) => [k, clampScore(v)])),
    issues_overview: issuesUnique.length > 0 ? issuesUnique : ["לא נמצאו בעיות מהותיות בבדיקה הראשונית."],
    issues_overview_en: issuesUniqueEn.length > 0 ? issuesUniqueEn : ["No major issues found in the initial scan."],
    confidence_level: params.confidence_level,
    warning: params.warning ? String(params.warning).slice(0, 140) : undefined,
    next_steps_cta: "שדרגו לטיפול מלא ע״י צוות VOW / קבעו שיחת אבחון.",
  }
}

