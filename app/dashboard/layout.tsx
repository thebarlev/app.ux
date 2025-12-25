import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 260, padding: 16, borderRight: "1px solid #eee" }}>
        <div style={{ fontWeight: 800, marginBottom: 16 }}>החשבון שלי</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/dashboard">🏠 בית</Link>
          <Link href="/dashboard/documents">📄 מסמכים</Link>
          <Link href="/dashboard/documents/receipt">🧾 קבלות</Link>
          <Link href="/dashboard/settings">⚙️ הגדרות</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}

