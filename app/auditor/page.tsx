import { redirect } from "next/navigation"
import AuditorHomeClient from "./AuditorHomeClient"
import { Suspense } from "react"
import { isSystemAdmin } from "@/lib/security/system-admin"
import { createClient } from "@/lib/supabase/server"

export default async function AuditorHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const scanId = typeof sp?.scanId === "string" ? sp.scanId.trim() : ""
  const token = typeof sp?.token === "string" ? sp.token.trim() : ""

  /*
   * A signed-in customer arriving with a scan link belongs in their own
   * account, not in the public marketing flow — that is what this guard is for.
   *
   * The `user` check was missing here and present in the English page written
   * five days later, so every anonymous visitor with a link was sent to a
   * dashboard that requires auth and bounced straight to /auditor/login. That
   * is exactly who a link is for: someone opening the report from an email, a
   * bookmark, or a share. The live flow never hit it, because it walks steps in
   * client state and its URL never gains scanId or token.
   */
  if (scanId && token) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const isAdmin = await isSystemAdmin()
    if (user && !isAdmin) redirect("/auditor/dashboard")
  }

  // White, not the old cream (#F7F3EE). Scoped to this page rather than the
  // /auditor layout, so the account dashboard underneath keeps its own.
  return (
    <main className="min-h-svh bg-white px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={null}>
          <AuditorHomeClient />
        </Suspense>
      </div>
    </main>
  )
}

