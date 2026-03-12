"use client";

import { useEffect } from "react";
import { FileText, Users, Settings, Receipt, UserPlus, BarChart } from "lucide-react";
import DashboardCard from "./DashboardCard";
import { SubscriptionUsageCard } from "@/components/subscription/SubscriptionUsageCard";
import { useSubscriptionStatus } from "@/components/subscription/useSubscriptionStatus";

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>
  }
}

export default function DashboardPage() {
  const { state: subscription, loading: subscriptionLoading } = useSubscriptionStatus()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!subscription || !subscription.ok) return

    const pendingPurchase = window.sessionStorage.getItem("vow_purchase_pending")
    const alreadyTracked = window.sessionStorage.getItem("vow_purchase_tracked")

    if (subscription.status === "active" && pendingPurchase && !alreadyTracked) {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({
        event: "vow_purchase",
        plan: subscription.plan_id,
        value: subscription.plan_price,
        currency: subscription.currency || "ILS",
      })

      window.sessionStorage.setItem("vow_purchase_tracked", "true")
      window.sessionStorage.removeItem("vow_purchase_pending")
    }
  }, [subscription])

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
          <SubscriptionUsageCard state={subscription} loading={subscriptionLoading} />
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
    </main>
  );
}



