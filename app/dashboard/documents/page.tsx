import Link from "next/link";

/* Updated to use Design Tokens - Jan 5, 2026 */
function Tile({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-card p-6 transition hover:bg-muted"
    >
      <div className="text-lg font-semibold text-card-fg">{title}</div>
      <div className="mt-1 text-sm text-muted-fg">{desc}</div>
    </Link>
  );
}

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-fg">מסמכים</h1>
        <p className="text-muted-fg">ניהול מסמכים לפי סוג.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile title="ריכוז כל המסמכים" desc="צפייה בכל המסמכים לפי סדר." href="/dashboard/documents/all" />
        <Tile title="קבלות" desc="רשימת קבלות, חיפוש וניהול." href="/dashboard/documents/receipts" />
        <Tile title="הפקת קבלה חדשה" desc="יצירת מסמך חדש." href="/dashboard/documents/new/receipt" />
      </div>
    </div>
  );
}
