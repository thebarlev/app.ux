import type React from "react"
import { notFound } from "next/navigation"
import { getAuditorConfig } from "@/lib/auditor/env"
import "@/app/(auth)/auth.css"

export default async function EnAuditorLayout({ children }: { children: React.ReactNode }) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) notFound()

  return <main className="min-h-svh bg-bg">{children}</main>
}
