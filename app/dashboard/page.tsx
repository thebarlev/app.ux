"use client";

import { FileText, Users, Settings, Receipt, UserPlus, BarChart } from "lucide-react";
import DashboardCard from "./DashboardCard";
import NewDocumentFab from "@/components/dashboard/NewDocumentFab";
import { SubscriptionUsageCard } from "@/components/subscription/SubscriptionUsageCard";

export default function DashboardPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container py-8 space-y-8">
        {/* Page Header (aligned to /dashboard/documents/new) */}
        <div className="space-y-2">
          <h1 className="ui-page-title">לוח בקרה</h1>
          <p className="ui-page-subtitle">ברוכים הבאים למערכת הניהול</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-right text-lg font-semibold text-fg">מנוי ושימוש</h2>
          <SubscriptionUsageCard />
        </section>

        {/* Quick Actions Grid */}
        <section className="space-y-4">
          <h2 className="text-right text-lg font-semibold text-fg">פעולות מהירות</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DashboardCard
              href="/dashboard/incomes/documents/new/receipt"
              icon={Receipt}
              title="קבלה חדשה"
              description="צור קבלה חדשה ללקוח"
            />
            <DashboardCard
              href="/dashboard/customers/new"
              icon={UserPlus}
              title="לקוח חדש"
              description="הוסף לקוח חדש למערכת"
            />
            <DashboardCard
              href="/dashboard/customers"
              icon={Users}
              title="כל הלקוחות"
              description="נהל את כל הלקוחות"
            />
            <DashboardCard
              href="/dashboard/documents/all"
              icon={FileText}
              title="כל המסמכים"
              description="ריכוז כל המסמכים במערכת"
            />
            <DashboardCard
              href="/dashboard/reports"
              icon={BarChart}
              title="דוחות"
              description="הפק דוחות חשבונאיים מקצועיים"
            />
            <DashboardCard
              href="/dashboard/settings"
              icon={Settings}
              title="הגדרות"
              description="הגדרות העסק והמערכת"
            />
          </div>
        </section>
      </div>

      <NewDocumentFab />
    </main>
  );
}



