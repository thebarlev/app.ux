"use client"

import { useState } from "react"
import { AdminHeader } from "@/components/admin/admin-header"
import { SettingsPanel } from "@/components/admin/settings-panel"

interface AdminLayoutClientProps {
  adminName: string
  children: React.ReactNode
}

export default function AdminLayoutClient({ adminName, children }: AdminLayoutClientProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="min-h-screen bg-muted/30" suppressHydrationWarning>
      <AdminHeader adminName={adminName} onSettingsClick={() => setShowSettings(true)} />
      
      {children}

      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} settings={[]} />
    </div>
  )
}
