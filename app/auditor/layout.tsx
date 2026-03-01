import type React from "react"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAuditorConfig, isAuditorAllowedEmail } from "@/lib/auditor/env"

export default async function AuditorLayout({ children }: { children: React.ReactNode }) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const email = typeof user.email === "string" ? user.email : null
  if (!isAuditorAllowedEmail(email)) {
    return (
      <main className="min-h-svh bg-bg px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold text-right">Auditor</h1>
          <div className="mt-6 rounded-ui border border-border bg-card p-6 text-right">
            <div className="text-lg font-medium">אין הרשאה</div>
            <div className="mt-2 text-sm text-muted-foreground">
              הפיצ&apos;ר זמין כרגע רק למשתמשי בטא מורשים.
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-bg px-6 py-10">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  )
}

