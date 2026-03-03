import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorSettingsClient from "./AuditorSettingsClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auditor/login")

  return (
    <main className="min-h-svh bg-[#F7F3EE] px-6 py-16">
      <div className="mx-auto max-w-xl">
        <AuditorSettingsClient />
      </div>
    </main>
  )
}
