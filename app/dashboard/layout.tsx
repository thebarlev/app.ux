import Link from "next/link";
import { LogoutButton } from "@/components/dashboard/LogoutButton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 260, padding: 16, borderRight: "1px solid #eee" }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginBottom: 16 
        }}>
          <div style={{ fontWeight: 800 }}>החשבון שלי</div>
          <LogoutButton />
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/dashboard">🏠 בית</Link>
          <Link href="/dashboard/documents">📄 מסמכים</Link>
          <Link href="/dashboard/documents/receipts">🧾 רשימת קבלות</Link>
          <Link href="/dashboard/documents/receipt">➕ קבלה חדשה</Link>
          <Link href="/dashboard/customers">👥 לקוחות</Link>
          <Link href="/dashboard/settings">⚙️ הגדרות</Link>
          <Link href="/dashboard/debug-receipts" style={{ color: "#dc2626", fontSize: 12 }}>🔍 Debug</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}

