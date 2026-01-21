"use client";

import { FileText, Users, Settings, PlusCircle, BarChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import DashboardCard from "./DashboardCard";
import NewDocumentFab from "@/components/dashboard/NewDocumentFab";

export default function DashboardPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10">
        {/* Page Header */}
        <div className="mb-[50px]">
          <h1 className="text-right mb-4">
            לוח בקרה
          </h1>
          <p className="text-right">
            ברוכים הבאים למערכת הניהול
          </p>
        </div>

        {/* Quick Actions */}
        <FormSection title="פעולות מהירות">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1120px] mx-auto w-full px-4 sm:px-6 lg:px-10">
            <DashboardCard
              href="/dashboard/documents/receipt"
              icon={PlusCircle}
              title="קבלה חדשה"
              description="צור קבלה חדשה ללקוח"
            />
            <DashboardCard
              href="/dashboard/customers/new"
              icon={Users}
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
        </FormSection>

        {/* Recent Activity */}

      </div>

      <NewDocumentFab />
    </main>
  );
}



