import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "מערכת ניהול עסקי - Business Management System",
    template: "%s | מערכת ניהול עסקי",
  },
  description: "מערכת ניהול מסמכים, קבלות וחשבוניות לעסקים - Business document and invoice management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {/* Skip to main content link - WCAG 2.1 AA requirement */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
