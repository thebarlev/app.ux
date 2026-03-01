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
}): PublicReport {
  const issues = params.findings
    .filter((f) => f.status === "fail" || f.status === "warn")
    .map((f) => RULE_TO_PUBLIC_ISSUE[f.rule_key])
    .filter(Boolean)

  const issuesUnique = Array.from(new Set(issues)).slice(0, 12)

  return {
    score_total: clampScore(params.score_total),
    score_search: clampScore(params.score_search),
    score_ai: clampScore(params.score_ai),
    category_scores: Object.fromEntries(Object.entries(params.category_scores || {}).map(([k, v]) => [k, clampScore(v)])),
    issues_overview: issuesUnique.length > 0 ? issuesUnique : ["לא נמצאו בעיות מהותיות בבדיקה הראשונית."],
    confidence_level: params.confidence_level,
    warning: params.warning ? String(params.warning).slice(0, 140) : undefined,
    next_steps_cta: "שדרגו לטיפול מלא ע״י צוות VOW / קבעו שיחת אבחון.",
  }
}

