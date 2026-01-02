import Link from "next/link";

function Tile({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-white/70">{desc}</div>
    </Link>
  );
}

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">מסמכים</h1>
        <p className="text-white/70">ניהול מסמכים לפי סוג.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile title="ריכוז כל המסמכים" desc="צפייה בכל המסמכים לפי סדר." href="/dashboard/documents/all" />
        <Tile title="קבלות" desc="רשימת קבלות, חיפוש וניהול." href="/dashboard/documents/receipts" />
        <Tile title="הפקת קבלה חדשה" desc="יצירת מסמך חדש." href="/dashboard/documents/new/receipt" />
      </div>
    </div>
  );
}
