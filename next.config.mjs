// ── Content-Security-Policy — REPORT-ONLY, deliberately not enforcing ──────────
//
// Enforcing a guessed CSP would break production. The app loads Supabase,
// PostHog, Google Fonts, GA4, the Meta Pixel and Vercel Analytics from the
// browser, and uses inline scripts (the gtag and Meta Pixel bootstrap snippets in
// app/layout.tsx) plus dangerouslySetInnerHTML in several places. Report-Only
// produces the data with no risk; enforcement is a stage-4 item driven by what
// these reports show.
//
// Origin list checked against app/layout.tsx on main. Note there is NO GTM
// container: GTM-WNGC226Q was retired, and googletagmanager.com now serves only
// the gtag.js loader for G-VRWRQ29QBW. main's layout contains no iframe and no
// noscript block at all, so frame-src grants nothing to it.
//
// Origins below are browser-side only. Deliberately NOT listed:
//   - PDF_RENDER_URL (lib/pdf-service.ts:2847) — server-side fetch, CSP does not apply
//   - secure.cardcom.solutions — reached from app/api/** server-to-server; kept in
//     form-action/frame-src only in case a checkout URL is ever framed or posted to
//   - api.ipify.org — server-side debug routes only
//
// 'unsafe-inline' is included on purpose: without it the inline analytics
// snippets and framework/inline styles would bury the external violations this
// is meant to surface. Moving to nonces is part of the enforcement work.
//
// NOTE: with no report-to/report-uri endpoint configured, violations appear only
// in each visitor's browser console — they are not aggregated anywhere. Wiring a
// collection endpoint is required before this can be called a data source.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://*.googletagmanager.com https://connect.facebook.net https://us.i.posthog.com https://us-assets.i.posthog.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://www.googletagmanager.com https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://connect.facebook.net https://www.facebook.com https://va.vercel-scripts.com",
  "frame-src 'self' https://secure.cardcom.solutions",
  "form-action 'self' https://secure.cardcom.solutions",
].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Same-origin only. Every document-preview iframe loads a relative
  // /api/documents/**/pdf URL, and main's layout has no third-party iframe at all,
  // so nothing breaks. This header restricts who may embed us, not who we embed.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // Keep typechecking enabled for production safety
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // `playwright-core` must remain a server-only external dependency.
    // Bundling it causes webpack to chase optional deps (electron/chromium-bidi) and fail.
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
}

export default nextConfig