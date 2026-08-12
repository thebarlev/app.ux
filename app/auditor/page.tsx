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
  //
  // px-4 on a phone, px-6 from sm up. 24px a side cost 48px of a 390px screen
  // and was most of why the headline broke to three lines and the lead card sat
  // at 295px wide.
  //
  // py-6 on a phone too. py-16 put 64px of nothing above the report's masthead,
  // which on a 390px screen is a fifth of the fold spent before the first word.
  // Step one does not miss it: its own block is min-h-[70svh] and centred, so it
  // sits in the same place either way.
  // The horizontal measure moved inside.
  //
  // `px-4 sm:px-6` and `mx-auto max-w-5xl` used to live here, wrapping the whole
  // flow — which meant the report could never place a full-bleed band, because a
  // band cannot escape padding and a max-width on its own ancestor. The measure
  // now sits on each step inside AuditorHomeClient instead, with the same classes
  // and the same values, so steps 1, 2 and the gate are unchanged and only the
  // report is free of it. Vertical padding stays here: it applies to all of them
  // equally and nothing needs to bleed through it.
  //
  // ⛔ sm:py-16 became sm:py-8.
  //
  // 64px of nothing above the masthead on a desktop, and the report's own first block
  // already carries its top spacing — so the two stacked and the first words sat far below
  // where the fold begins. py-6 on a phone is unchanged: that number was measured earlier
  // and is not the complaint.
  return (
    <main className="min-h-svh bg-white py-6 sm:py-8">
      <Suspense fallback={null}>
        <AuditorHomeClient />
      </Suspense>
    </main>
  )
}

