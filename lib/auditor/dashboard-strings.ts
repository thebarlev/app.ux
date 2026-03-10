export type Locale = "he" | "en"

export type DashboardStrings = {
  title: string
  tagline: string
  lastScanScore: string
  overallScore: string
  searchVisibility: string
  aiReadiness: string
  viewFullReport: string
  noScanYet: string
  noActiveCompany: string
  noActiveCompanyDesc: string
  scanHistory: string
  scanHistoryDesc: string
  status: string
  score: string
  columnDomain: string
  columnStep: string
}

const STRINGS: Record<Locale, DashboardStrings> = {
  he: {
    title: "מרכז הביקורת",
    tagline: "אנחנו מתחילים לשפר את החשיפה של העסק שלך ב-AI וב-SEO",
    lastScanScore: "ציון הסריקה האחרונה",
    overallScore: "ציון כללי",
    searchVisibility: "חשיפה בחיפוש",
    aiReadiness: "מוכנות AI",
    viewFullReport: "צפה בדוח המלא (Admin)",
    noScanYet: "אין סריקה עדיין.",
    noActiveCompany: "אין חברה פעילה",
    noActiveCompanyDesc: "כדי לצפות בהיסטוריה, יש להתחבר לחשבון עם חברה פעילה.",
    scanHistory: "היסטוריית סריקות",
    scanHistoryDesc: "לפי חברה",
    status: "סטטוס",
    score: "ציון",
    columnDomain: "דומיין",
    columnStep: "שלב",
  },
  en: {
    title: "Audit Center",
    tagline: "We're improving your business visibility in AI & SEO",
    lastScanScore: "Last scan score",
    overallScore: "Overall score",
    searchVisibility: "Search visibility",
    aiReadiness: "AI readiness",
    viewFullReport: "View full report (Admin)",
    noScanYet: "No scan yet.",
    noActiveCompany: "No active company",
    noActiveCompanyDesc: "Sign in with an account that has an active company to view history.",
    scanHistory: "Scan history",
    scanHistoryDesc: "By company",
    status: "Status",
    score: "Score",
    columnDomain: "Domain",
    columnStep: "Step",
  },
}

export function getDashboardStrings(locale: Locale): DashboardStrings {
  return STRINGS[locale]
}
