import type React from "react"
import { notFound } from "next/navigation"
import { getAuditorConfig } from "@/lib/auditor/env"

export default async function AuditorLayout({ children }: { children: React.ReactNode }) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) notFound()

  return (
    <main className="min-h-svh bg-[#F7F3EE]">{children}</main>
  )
}

