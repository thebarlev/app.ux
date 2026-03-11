export type ConfidenceLevel = "high" | "medium" | "low"

export type Locale = "he" | "en"

export type PublicReport = {
  score_total: number
  score_search: number
  score_ai: number
  category_scores: Record<string, number>
  issues_overview: string[]
  confidence_level: ConfidenceLevel
  warning?: string
  next_steps_cta?: string
  ai_readiness_summary?: {
    average_score: number
    pages_analyzed: number
    top_strengths: string[]
    top_gaps: string[]
  }
  recommendations_count?: number
  top_recommendations?: string[]
}

/** Rule key → translations per locale. Add new locales here. */
const RULE_KEY_TO_LOCALE: Record<string, { he: string; en: string }> = {
  "tech.robots_block_all": {
    he: "robots.txt חוסם סריקה — מנועי חיפוש וכלי AI לא יוכלו לקרוא את האתר.",
    en: "robots.txt blocks crawling — search engines and AI tools cannot read the site.",
  },
  "tech.noindex_present": {
    he: "האתר מסומן כ-Noindex — ייתכן שגוגל/בוטים לא יציגו את האתר בתוצאות.",
    en: "Site is marked Noindex — Google/bots may not show the site in results.",
  },
  "tech.https_enforced": {
    he: "אין אכיפה עקבית של HTTPS — מומלץ לייצב הפניות וגרסה ראשית אחת.",
    en: "No consistent HTTPS enforcement — recommend standardizing redirects to secure version.",
  },
  "tech.canonical_host_match": {
    he: "Canonical לא עקבי — עלול לגרום לכפילויות ופגיעה בדירוג.",
    en: "Canonical is inconsistent — may cause duplicates and hurt ranking.",
  },
  "tech.sitemap_present": {
    he: "חסר sitemap.xml תקין — אינדוקס יכול להיות חלקי.",
    en: "Valid sitemap.xml is missing — indexing may be partial.",
  },
  "tech.robots_txt_present": {
    he: "חסר robots.txt או שהוא לא נגיש — מומלץ להוסיף הגדרות סריקה בסיסיות.",
    en: "robots.txt is missing or inaccessible — add basic crawl directives.",
  },
  "tech.title_present": {
    he: "להוסיף תגית title ייחודית וברורה לעמוד הבית (עדיף 30–60 תווים).",
    en: "Add a unique, clear title tag to the homepage (30–60 chars preferred).",
  },
  "tech.meta_description_present": {
    he: "להוסיף meta description איכותי (כ־120–160 תווים) שמסביר את הערך של האתר ומעודד הקלקה.",
    en: "Add a quality meta description (120–160 chars) that explains the site value.",
  },
  "tech.canonical_present": {
    he: "מומלץ להוסיף canonical כדי לצמצם כפילויות ולהבהיר למנועי חיפוש מה ה-URL הראשי.",
    en: "Add canonical to reduce duplicates and clarify the primary URL.",
  },
  "tech.html_lang_present": {
    he: "להגדיר `lang` על תגית `<html>` (לדוגמה `he`/`en`) כדי לשפר SEO ונגישות.",
    en: "Set lang on the <html> tag (e.g. he/en) to improve SEO and accessibility.",
  },
  "onpage.viewport_present": {
    he: "חסר meta viewport — חוויית מובייל עלולה להיפגע.",
    en: "Meta viewport is missing — mobile experience may suffer.",
  },
  "onpage.single_h1": {
    he: "מבנה כותרות בעמודים לא עקבי (H1) — מומלץ לשפר היררכיה.",
    en: "Heading structure is inconsistent (H1) — improve hierarchy.",
  },
  "onpage.images_alt": {
    he: "חסרים טקסטים חלופיים (alt) לתמונות — פוגע בנגישות וב-SEO.",
    en: "Missing alt text for images — hurts accessibility and SEO.",
  },
  "schema.jsonld_present": {
    he: "להוסיף Schema.org באמצעות JSON-LD (לפחות Organization ו-WebSite) כדי לשפר הבנה סמנטית ו-AEO.",
    en: "Add Schema.org via JSON-LD (at least Organization and WebSite).",
  },
  "schema.org_or_website_type": {
    he: "מומלץ להוסיף/לחזק JSON-LD מסוג `Organization` ו/או `WebSite` בעמוד הבית.",
    en: "Add or strengthen Organization and/or WebSite JSON-LD on the homepage.",
  },
  "schema.faq_or_article": {
    he: "חסרה סכמה מתאימה (FAQ/Article) בעמודים רלוונטיים — מקשה על AI לחלץ תשובות.",
    en: "Suitable schema (FAQ/Article) is missing on relevant pages — makes it harder for AI to extract answers.",
  },
  "ai.llms_txt_present": {
    he: "חסר קובץ llms.txt — מומלץ כדי לשפר קריאות ל-AI.",
    en: "llms.txt file is missing — recommended to improve AI readability.",
  },
  "ai.well_known_ai_json_present": {
    he: "מומלץ להוסיף `/.well-known/ai.json` (אם רלוונטי) כדי לחשוף מטא-דאטה/מדיניות ל-AI crawlers וכלים.",
    en: "Add /.well-known/ai.json (if relevant) for AI crawlers.",
  },
  "ai.brand_json_present": {
    he: "מומלץ להוסיף `/brand.json` בסיסי (או חלופה) עם פרטי מותג לשימוש בכלים אוטומטיים.",
    en: "Add a basic /brand.json with brand details for automated tools.",
  },
  "tracking.gtm_present": {
    he: "מומלץ להטמיע Google Tag Manager כדי לנהל אנליטיקה/אירועים בצורה נקייה.",
    en: "Implement Google Tag Manager for analytics/events.",
  },
  "tracking.ga4_present": {
    he: "מומלץ להטמיע GA4 כדי למדוד תנועה, המרות, וערוצי רכישה.",
    en: "Implement GA4 to measure traffic, conversions, and acquisition.",
  },
  "tracking.social_meta_present": {
    he: "מומלץ להוסיף תגיות OpenGraph + Twitter כדי לשפר תצוגה בשיתופים (ולשפר CTR ברשתות).",
    en: "Add OpenGraph and Twitter tags to improve sharing display.",
  },
}

const FALLBACK_NO_ISSUES: Record<Locale, string> = {
  he: "לא נמצאו בעיות מהותיות בבדיקה הראשונית.",
  en: "No major issues found in the initial scan.",
}

const FALLBACK_FETCH_FAILED: Record<Locale, string> = {
  he: "לא הצלחנו למשוך עמודים לניתוח. נסה שוב מאוחר יותר.",
  en: "Could not fetch pages for analysis. Please try again later.",
}

/** Get issue text for a rule_key in the given locale. */
export function getIssueForLocale(ruleKey: string, locale: Locale): string | null {
  const t = RULE_KEY_TO_LOCALE[ruleKey]
  return t ? t[locale] : null
}

/** Get all issue texts for rule_keys in the given locale. */
export function getIssuesForLocale(ruleKeys: string[], locale: Locale): string[] {
  return ruleKeys
    .map((k) => getIssueForLocale(k, locale))
    .filter((s): s is string => Boolean(s))
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
  const ruleKeys = failWarn.map((f) => f.rule_key)

  const issuesHe = getIssuesForLocale(ruleKeys, "he")
  const issuesEn = getIssuesForLocale(ruleKeys, "en")
  const issuesUniqueHe = Array.from(new Set(issuesHe)).slice(0, 12)
  const issuesUniqueEn = Array.from(new Set(issuesEn)).slice(0, 12)

  return {
    score_total: clampScore(params.score_total),
    score_search: clampScore(params.score_search),
    score_ai: clampScore(params.score_ai),
    category_scores: Object.fromEntries(Object.entries(params.category_scores || {}).map(([k, v]) => [k, clampScore(v)])),
    issues_overview: issuesUniqueHe.length > 0 ? issuesUniqueHe : [FALLBACK_NO_ISSUES.he],
    issues_overview_en: issuesUniqueEn.length > 0 ? issuesUniqueEn : [FALLBACK_NO_ISSUES.en],
    confidence_level: params.confidence_level,
    warning: params.warning ? String(params.warning).slice(0, 140) : undefined,
    next_steps_cta: "שדרגו לטיפול מלא ע״י צוות VOW / קבעו שיחת אבחון.",
  }
}

/** Build minimal report for fail-safe (no pages fetched). Always includes both locales for dashboard compatibility. */
export function buildMinimalReport() {
  return {
    score_total: 0,
    score_search: 0,
    score_ai: 0,
    category_scores: { search_readiness: 0, ai_readiness: 0 },
    issues_overview: [FALLBACK_FETCH_FAILED.he],
    issues_overview_en: [FALLBACK_FETCH_FAILED.en],
    confidence_level: "low" as const,
    warning: "לא הצלחנו למשוך עמודים לניתוח.",
  }
}
