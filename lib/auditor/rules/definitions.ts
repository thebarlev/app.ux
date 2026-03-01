import type { AuditorRuleCategory, AuditorRuleEffort, AuditorRuleImpact, AuditorRuleStatus } from "../types"

export type AuditorRuleResult = {
  rule_key: string
  category: AuditorRuleCategory
  weight: number
  status: AuditorRuleStatus
  impact: AuditorRuleImpact
  effort: AuditorRuleEffort
  evidence: Record<string, any>
  recommendation_he: string
}

export type AuditorRulesContext = {
  scan: {
    target_url: string
    normalized_url: string | null
    hostname: string | null
    artifacts: any
  }
  pages: Array<{
    url: string
    path: string | null
    title: string | null
    meta_description: string | null
    canonical: string | null
    lang: string | null
    dir: string | null
    has_og: boolean | null
    has_twitter: boolean | null
    jsonld_types: any
    tracking: any
  }>
}

function homepage(ctx: AuditorRulesContext) {
  const byRoot = ctx.pages.find((p) => p.path === "/" || p.url.endsWith("/") || p.url === ctx.scan.normalized_url)
  return byRoot || ctx.pages[0] || null
}

function asStringArray(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((x) => String(x))
  return []
}

function hasType(types: string[], t: string): boolean {
  const want = t.toLowerCase()
  return types.some((x) => String(x).toLowerCase() === want)
}

export function evaluateAllRules(ctx: AuditorRulesContext): AuditorRuleResult[] {
  const hp = homepage(ctx)
  const artifacts = ctx.scan.artifacts || {}
  const ai = artifacts.ai_files || artifacts.ai || {}
  const robots = artifacts.robots || {}
  const sitemap = artifacts.sitemap || {}

  const hpTypes = hp ? asStringArray(hp.jsonld_types) : []
  const tracking = hp?.tracking || {}
  const gtmIds = asStringArray(tracking?.gtmIds)
  const ga4Ids = asStringArray(tracking?.ga4Ids)

  const results: AuditorRuleResult[] = []

  // ---------- Technical SEO ----------
  {
    const ok = !!(hp?.title && hp.title.trim())
    results.push({
      rule_key: "tech.title_present",
      category: "technical",
      weight: 10,
      status: ok ? "pass" : "fail",
      impact: "high",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, title: hp?.title || null },
      recommendation_he: ok ? "כותרת עמוד הבית קיימת." : "להוסיף תגית title ייחודית וברורה לעמוד הבית (עדיף 30–60 תווים).",
    })
  }
  {
    const ok = !!(hp?.meta_description && hp.meta_description.trim())
    results.push({
      rule_key: "tech.meta_description_present",
      category: "technical",
      weight: 8,
      status: ok ? "pass" : "fail",
      impact: "medium",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, meta_description: hp?.meta_description || null },
      recommendation_he: ok ? "Meta description קיים." : "להוסיף meta description איכותי (כ־120–160 תווים) שמסביר את הערך של האתר ומעודד הקלקה.",
    })
  }
  {
    const ok = !!(hp?.canonical && hp.canonical.trim())
    results.push({
      rule_key: "tech.canonical_present",
      category: "technical",
      weight: 6,
      status: ok ? "pass" : "warn",
      impact: "medium",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, canonical: hp?.canonical || null },
      recommendation_he: ok ? "Canonical קיים." : "מומלץ להוסיף canonical כדי לצמצם כפילויות ולהבהיר למנועי חיפוש מה ה-URL הראשי.",
    })
  }
  {
    const ok = !!(hp?.lang && hp.lang.trim())
    results.push({
      rule_key: "tech.html_lang_present",
      category: "technical",
      weight: 6,
      status: ok ? "pass" : "fail",
      impact: "medium",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, lang: hp?.lang || null, dir: hp?.dir || null },
      recommendation_he: ok ? "שפת המסמך מוגדרת." : "להגדיר `lang` על תגית `<html>` (לדוגמה `he`/`en`) כדי לשפר SEO ונגישות.",
    })
  }
  {
    const ok = robots?.found === true
    results.push({
      rule_key: "tech.robots_txt_present",
      category: "technical",
      weight: 5,
      status: ok ? "pass" : "warn",
      impact: "low",
      effort: "low",
      evidence: { robots_status: robots?.status ?? null, robots_url: robots?.url ?? null },
      recommendation_he: ok ? "robots.txt נמצא." : "מומלץ להוסיף `robots.txt` כדי להגדיר הנחיות סריקה (ולכלול Sitemap אם קיים).",
    })
  }
  {
    const ok = (sitemap?.url_count ?? 0) > 0
    results.push({
      rule_key: "tech.sitemap_present",
      category: "technical",
      weight: 8,
      status: ok ? "pass" : "fail",
      impact: "high",
      effort: "low",
      evidence: { sitemap_url: sitemap?.url ?? null, url_count: sitemap?.url_count ?? 0 },
      recommendation_he: ok ? "Sitemap נמצא." : "להוסיף `sitemap.xml` (או להצהיר עליו ב-robots.txt) כדי לשפר אינדוקס ויעילות סריקה.",
    })
  }

  // ---------- Schema ----------
  {
    const ok = hpTypes.length > 0
    results.push({
      rule_key: "schema.jsonld_present",
      category: "schema",
      weight: 10,
      status: ok ? "pass" : "fail",
      impact: "high",
      effort: "medium",
      evidence: { homepage_url: hp?.url || null, jsonld_types: hpTypes },
      recommendation_he: ok ? "JSON-LD נמצא." : "להוסיף Schema.org באמצעות JSON-LD (לפחות Organization ו-WebSite) כדי לשפר הבנה סמנטית ו-AEO.",
    })
  }
  {
    const ok = hasType(hpTypes, "Organization") || hasType(hpTypes, "WebSite")
    results.push({
      rule_key: "schema.org_or_website_type",
      category: "schema",
      weight: 8,
      status: ok ? "pass" : "warn",
      impact: "medium",
      effort: "medium",
      evidence: { homepage_url: hp?.url || null, jsonld_types: hpTypes },
      recommendation_he: ok
        ? "נראה שיש טיפוסי Schema בסיסיים."
        : "מומלץ להוסיף/לחזק JSON-LD מסוג `Organization` ו/או `WebSite` בעמוד הבית.",
    })
  }

  // ---------- AI readiness ----------
  {
    const ok = ai?.llms_txt?.found === true
    results.push({
      rule_key: "ai.llms_txt_present",
      category: "ai_readiness",
      weight: 10,
      status: ok ? "pass" : "fail",
      impact: "high",
      effort: "low",
      evidence: { url: ai?.llms_txt?.url ?? null, status: ai?.llms_txt?.status ?? null },
      recommendation_he: ok
        ? "`/llms.txt` נמצא."
        : "להוסיף קובץ `/llms.txt` כדי להציג למודלי שפה את מקורות המידע, ההנחיות והעמודים המומלצים לקריאה.",
    })
  }
  {
    const ok = ai?.ai_json?.found === true
    results.push({
      rule_key: "ai.well_known_ai_json_present",
      category: "ai_readiness",
      weight: 6,
      status: ok ? "pass" : "warn",
      impact: "medium",
      effort: "low",
      evidence: { url: ai?.ai_json?.url ?? null, status: ai?.ai_json?.status ?? null },
      recommendation_he: ok
        ? "`/.well-known/ai.json` נמצא."
        : "מומלץ להוסיף `/.well-known/ai.json` (אם רלוונטי) כדי לחשוף מטא-דאטה/מדיניות ל-AI crawlers וכלים.",
    })
  }
  {
    const ok = ai?.brand_json?.found === true
    results.push({
      rule_key: "ai.brand_json_present",
      category: "ai_readiness",
      weight: 4,
      status: ok ? "pass" : "warn",
      impact: "low",
      effort: "low",
      evidence: { url: ai?.brand_json?.url ?? null, status: ai?.brand_json?.status ?? null },
      recommendation_he: ok ? "`/brand.json` נמצא." : "מומלץ להוסיף `/brand.json` בסיסי (או חלופה) עם פרטי מותג לשימוש בכלים אוטומטיים.",
    })
  }

  // ---------- Tracking ----------
  {
    const ok = tracking?.hasGtm === true
    results.push({
      rule_key: "tracking.gtm_present",
      category: "tracking",
      weight: 6,
      status: ok ? "pass" : "warn",
      impact: "medium",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, gtmIds },
      recommendation_he: ok ? "GTM זוהה." : "מומלץ להטמיע Google Tag Manager כדי לנהל אנליטיקה/אירועים בצורה נקייה.",
    })
  }
  {
    const ok = tracking?.hasGa4 === true
    results.push({
      rule_key: "tracking.ga4_present",
      category: "tracking",
      weight: 6,
      status: ok ? "pass" : "warn",
      impact: "medium",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, ga4Ids },
      recommendation_he: ok ? "GA4 זוהה." : "מומלץ להטמיע GA4 כדי למדוד תנועה, המרות, וערוצי רכישה.",
    })
  }
  {
    const ok = hp?.has_og === true && hp?.has_twitter === true
    results.push({
      rule_key: "tracking.social_meta_present",
      category: "tracking",
      weight: 4,
      status: ok ? "pass" : "warn",
      impact: "low",
      effort: "low",
      evidence: { homepage_url: hp?.url || null, has_og: hp?.has_og ?? null, has_twitter: hp?.has_twitter ?? null },
      recommendation_he: ok
        ? "תגיות OpenGraph/Twitter קיימות."
        : "מומלץ להוסיף תגיות OpenGraph + Twitter כדי לשפר תצוגה בשיתופים (ולשפר CTR ברשתות).",
    })
  }

  return results
}

