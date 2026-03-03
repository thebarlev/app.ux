import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuditorInvoicesClient from "./AuditorInvoicesClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorInvoicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auditor/login")

  return (
    <main className="min-h-svh bg-[#F7F3EE] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <AuditorInvoicesClient />
      </div>
    </main>
  )
}
