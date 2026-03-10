import { redirect } from "next/navigation"
import AuditorHomeClient from "@/app/auditor/AuditorHomeClient"
import { Suspense } from "react"
import { isSystemAdmin } from "@/lib/security/system-admin"
import { createClient } from "@/lib/supabase/server"

export default async function EnAuditorHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const scanId = typeof sp?.scanId === "string" ? sp.scanId.trim() : ""
  const token = typeof sp?.token === "string" ? sp.token.trim() : ""

  if (scanId && token) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isAdmin = await isSystemAdmin()
    if (user && !isAdmin) redirect("/en/auditor/dashboard")
  }

  return (
    <main className="min-h-svh bg-[#F7F3EE] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={null}>
          <AuditorHomeClient locale="en" basePath="/en/auditor" />
        </Suspense>
      </div>
    </main>
  )
}
