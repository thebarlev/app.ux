import Link from "next/link";
import { FileText, Users, Settings, PlusCircle } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">לוח בקרה</h1>
        <p className="text-white/60">ברוכים הבאים למערכת הניהול</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          href="/dashboard/documents/receipt"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition">
              <PlusCircle className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">קבלה חדשה</h3>
          </div>
          <p className="text-sm text-white/60">צור קבלה חדשה ללקוח</p>
        </Link>

        <Link
          href="/dashboard/documents/receipts"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-green-500/20 rounded-xl group-hover:bg-green-500/30 transition">
              <FileText className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">כל הקבלות</h3>
          </div>
          <p className="text-sm text-white/60">צפה וערוך קבלות קיימות</p>
        </Link>

        <Link
          href="/dashboard/customers/new"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-purple-500/20 rounded-xl group-hover:bg-purple-500/30 transition">
              <Users className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">לקוח חדש</h3>
          </div>
          <p className="text-sm text-white/60">הוסף לקוח חדש למערכת</p>
        </Link>

        <Link
          href="/dashboard/customers"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-orange-500/20 rounded-xl group-hover:bg-orange-500/30 transition">
              <Users className="h-6 w-6 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">כל הלקוחות</h3>
          </div>
          <p className="text-sm text-white/60">נהל את כל הלקוחות</p>
        </Link>

        <Link
          href="/dashboard/documents/all"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-cyan-500/20 rounded-xl group-hover:bg-cyan-500/30 transition">
              <FileText className="h-6 w-6 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">כל המסמכים</h3>
          </div>
          <p className="text-sm text-white/60">ריכוז כל המסמכים במערכת</p>
        </Link>

        <Link
          href="/dashboard/settings"
          className="group block p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:border-white/20"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-gray-500/20 rounded-xl group-hover:bg-gray-500/30 transition">
              <Settings className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">הגדרות</h3>
          </div>
          <p className="text-sm text-white/60">הגדרות העסק והמערכת</p>
        </Link>
      </div>

      {/* Recent Activity (Placeholder) */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-4">פעילות אחרונה</h2>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-white/60 text-center py-8">אין פעילות אחרונה להצגה</p>
        </div>
      </div>
    </div>
  );
}


