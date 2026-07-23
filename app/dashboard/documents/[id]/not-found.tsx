import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Not-found boundary for a single document.
 *
 * Without this, notFound() from the document page bubbles up to
 * app/dashboard/not-found.tsx — "העמוד הזה עדיין בבנייה" — which is wrong and
 * actively misleading here: a deleted or mistyped document id is not an unbuilt
 * feature. Next.js resolves to the nearest boundary, so this only affects
 * /dashboard/documents/[id]; the dashboard-wide page is untouched.
 */
export default function DocumentNotFound() {
  return (
    <div dir="rtl" className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link
          href="/dashboard/documents/income"
          className="mb-4 inline-flex items-center gap-2 text-[16px] text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לרשימת המסמכים
        </Link>

        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E9ECF2] bg-white px-6 py-16 text-center">
          <h1 className="mb-3 text-2xl font-bold text-fg">מסמך לא נמצא</h1>
          <p className="mb-8 text-lg text-muted-fg">
            המסמך המבוקש אינו קיים, נמחק, או שאינו שייך לעסק שלך.
          </p>
          <Link
            href="/dashboard/documents/income"
            className="rounded-ui bg-primary px-6 py-3 text-base font-bold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            לרשימת המסמכים
          </Link>
        </div>
      </div>
    </div>
  );
}
