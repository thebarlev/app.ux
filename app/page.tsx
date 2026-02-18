import type { Metadata } from "next";
import { HomeLanding } from "@/components/home/HomeLanding";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.vow.co.il"),

  title: "VOW – רו״ח AI, חשבונית דיגיטלית ופיתוח אתרים ומערכות",
  description:
    "VOW היא פלטפורמה עסקית חכמה המשלבת רו״ח AI מתקדם, חשבונית דיגיטלית מאובטחת לשנה חינם, שיווק מבוסס AI, עיצוב ומיתוג ופיתוח אתרים ומערכות – הכל במקום אחד לעסקים קטנים ובינוניים.",

  keywords: [
    "רו״ח AI",
    "חשבונית דיגיטלית",
    "חשבוניות אונליין",
    "מערכת חשבוניות",
    "חתימה דיגיטלית",
    "חיבור לשע״מ",
    "פיתוח אתרים",
    "ניהול מוצר",
    "שיווק מבוסס AI",
    "מערכת ניהול עסקי",
    "עיצוב ומיתוג לעסקים",
  ],

  openGraph: {
    title: "VOW – רו״ח AI ומערכת עסקית חכמה לעסקים קטנים",
    description:
      "חשבונית דיגיטלית מאובטחת לשנה חינם, רו״ח AI שמבין מס הכנסה ומע״מ, שיווק חכם, עיצוב ופיתוח מערכות – הכל בפלטפורמה אחת.",
    url: "https://app.vow.co.il",
    siteName: "VOW",
    images: [
      {
        url: "https://app.vow.co.il/og-home.jpg",
        width: 1200,
        height: 630,
        alt: "VOW – AI Accountant & Digital Business Platform",
      },
    ],
    locale: "he_IL",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "VOW – רו״ח AI ופלטפורמה עסקית חכמה",
    description:
      "שנה חינם לחשבונית דיגיטלית מאובטחת + רו״ח AI, שיווק, מיתוג ופיתוח מערכות לעסקים.",
    images: ["https://app.vow.co.il/og-home.jpg"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function Page() {
  return <HomeLanding />;
}
