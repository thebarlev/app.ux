import type { MarketingPage, Section } from "./types";

function block(text: string): { _type: "block"; children: Array<{ _type: "span"; text: string }> } {
  return { _type: "block", children: [{ _type: "span", text }] };
}

const landingSections: Section[] = [
  {
    _id: "hero",
    type: "hero",
    title: "המערכת החכמה להפקת מסמכים חשבונאיים",
    content: [block("הפקת קבלות, חשבוניות ומסמכים נוספים במהירות, כולל תהליכי חתימה דיגיטלית לפי הצורך.")],
    order: 1,
    imageUrl: "/placeholder.jpg",
  },
  {
    _id: "features",
    type: "features",
    title: "מה מקבלים אצלנו",
    content: [
      block("ניהול מסמכים מרוכז, יצירת PDF, תבניות, ושדות מותאמים."),
      block("חוויית עבודה מהירה בדשבורד עם חיפוש וטיוטות."),
    ],
    order: 2,
  },
  {
    _id: "howItWorks",
    type: "howItWorks",
    title: "איך זה עובד",
    content: [block("ממלאים פרטים → מאשרים → מורידים את המסמך.")],
    order: 3,
  },
  {
    _id: "cta",
    type: "cta",
    title: "מוכנים להתחיל?",
    content: [block("התחברו למערכת או פתחו חשבון חדש.")],
    order: 99,
  },
];

const landingPage: MarketingPage = {
  _id: "marketingPage.landing",
  title: "Landing Page",
  slug: { current: "landing" },
  sections: landingSections,
  seo: {
    metaTitle: "VOW System",
    metaDescription: "מערכת להפקת מסמכים חשבונאיים",
    ogImageUrl: "/placeholder.jpg",
  },
  ctaButtonText: "הרשמה",
  ctaButtonLink: "/register",
};

/**
 * Local (non‑Sanity) marketing pages.
 * Returns null when page doesn't exist.
 */
export async function getMarketingPage(slug: string = "landing"): Promise<MarketingPage | null> {
  if (slug === "landing") return landingPage;
  return null;
}

