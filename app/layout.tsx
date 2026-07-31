import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MetaPixelRouteTracker from "@/components/MetaPixelRouteTracker";
import PosthogProvider from "@/components/PosthogProvider";
import { getPixelId, metaPixelBootstrapScript } from "@/lib/analytics/meta-pixel";

const APP_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.uxellent.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(APP_SITE_URL),
  title: {
    default: "מערכת ניהול עסקי - Business Management System",
    template: "%s | מערכת ניהול עסקי",
  },
  description:
    "מערכת ניהול מסמכים, קבלות וחשבוניות לעסקים - Business document and invoice management system",
  openGraph: {
    siteName: "UXellent",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/icon.svg",
        alt: "UXellent",
      },
    ],
  },
  twitter: {
    card: "summary",
    images: ["/icon.svg"],
  },
  icons: {
    icon: "/favicon.ico?v=2",
    shortcut: "/favicon.ico?v=2",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const metaPixelId = getPixelId();

  return (
    <html lang="he" dir="rtl">
      <head>
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
          `}
        </Script>

        {/*
          No GTM container.

          GTM-WNGC226Q was registered under itzik@uxellent.com, an account that
          went away with the Workspace. It is not visible from either remaining
          account, so nobody can add, edit or remove a tag inside it — every
          dataLayer event this app pushed was landing in a container with no
          reachable destination.

          The marketing site took the same container apart first and replaced it
          with its tags loaded directly; this is the same move. GA4 here already
          loads its own gtag.js below and never went through the container, so
          removing it costs no measurement.
        */}

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-VRWRQ29QBW"
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-VRWRQ29QBW');
          `}
        </Script>

        {/*
          Meta Pixel — same Pixel ID as uxellent.com, so a visitor who arrives
          from a campaign on the marketing site and converts here is stitched
          into one journey via the _fbp cookie on the shared domain.
          See lib/analytics/meta-pixel.ts.
        */}
        {metaPixelId ? (
          <Script id="meta-pixel" strategy="afterInteractive">
            {metaPixelBootstrapScript(metaPixelId)}
          </Script>
        ) : null}

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>

      <body>
        {/* Analytics page tracking - wrapped in Suspense for useSearchParams during static generation */}
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>

        <Suspense fallback={null}>
          <MetaPixelRouteTracker />
        </Suspense>

        {/* Skip link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          דלג לתוכן הראשי
        </a>

        <Suspense fallback={null}>
          <PosthogProvider>{children}</PosthogProvider>
        </Suspense>

        {/* Vercel Analytics — tracks page views across the entire site (Auditor + invoice). */}
        <Analytics />
      </body>
    </html>
  );
}