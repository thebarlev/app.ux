"use client";

/* Updated to use Design Tokens - Jan 5, 2026 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="text-7xl mb-4">⚠️</div>
      <h1 className="text-3xl font-black mb-3 text-fg">
        אופס… משהו השתבש
      </h1>
      <p className="text-lg text-muted-fg mb-8">
        נתקלנו בבעיה בלתי צפויה. אנא נסו שוב.
      </p>
      <div className="flex gap-3">
        <button 
          onClick={reset}
          className="px-6 py-3 bg-primary text-primary-fg rounded-ui font-bold text-base hover:bg-primary-hover transition-colors cursor-pointer border-0"
        >
          נסה שוב
        </button>
        <a 
          href="/dashboard"
          className="px-6 py-3 bg-secondary text-secondary-fg border border-border rounded-ui font-semibold text-base hover:bg-muted transition-colors no-underline inline-block"
        >
          חזרה לדף הבית
        </a>
      </div>
    </div>
  );
}
