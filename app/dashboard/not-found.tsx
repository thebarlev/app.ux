/* Updated to use Design Tokens - Jan 5, 2026 */
export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="text-7xl mb-4">😊</div>
      <h1 className="text-3xl font-black mb-3 text-fg">
        העמוד הזה עדיין בבנייה
      </h1>
      <p className="text-lg text-muted-fg mb-8">
        אנחנו עובדים על זה — בקרו שוב מאוחר יותר!
      </p>
      <a 
        href="/dashboard"
        className="px-6 py-3 bg-primary text-primary-fg rounded-ui font-bold text-base hover:bg-primary-hover transition-colors"
      >
        חזרה לדף הבית
      </a>
    </div>
  );
}
