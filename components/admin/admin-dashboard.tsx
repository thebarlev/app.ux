"use client"

import { useState } from "react"
import { KpiCards } from "./kpi-cards"
import { CompaniesTable } from "./companies-table"
import { ExportDataPanel } from "./export-data-panel"
import { AdminHeader } from "./admin-header"
import { SettingsPanel } from "./settings-panel"
import type { Company, GlobalSetting, KpiData } from "@/lib/types/admin"

interface AdminDashboardProps {
  kpiData: KpiData
  companies: Company[]
  settings: GlobalSetting[]
  adminName?: string
}

export function AdminDashboard({ kpiData, companies: initialCompanies, settings, adminName = "Admin" }: AdminDashboardProps) {
  const [companies, setCompanies] = useState(initialCompanies)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleStatusChange = (companyId: string, newStatus: "active" | "suspended") => {
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, status: newStatus } : c)))
  }

  return (
    <>
      <AdminHeader adminName={adminName} onSettingsClick={() => setSettingsOpen(true)} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-white/70">Monitor and manage all accounts in the system</p>
      </div>

      <KpiCards data={kpiData} />

      <div className="mt-8">
        <ExportDataPanel totalCompanies={companies.length} />
      </div>

      <div className="mt-8">
        <CompaniesTable companies={companies} onStatusChange={handleStatusChange} />
      </div>
    </main>
    </>
  )
}
