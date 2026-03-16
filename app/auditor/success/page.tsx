import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function AuditorSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auditor/login?returnTo=${encodeURIComponent("/auditor/dashboard")}`)
  }

  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (typeof value === "string" && value.trim()) {
      query[key] = value.trim()
    }
  }

  const lowProfileCode =
    query.lowprofilecode ||
    query.LowProfileCode ||
    query.lowProfileCode ||
    null

  if (lowProfileCode) {
    const admin = createAdminClient()
    const eventId = `cardcom:indicator:${lowProfileCode}`

    try {
      const { error: insertError } = await admin.from("auditor_billing_events").insert({
        provider: "cardcom",
        event_id: eventId,
        status: "received",
        payload: { query },
      } as any)

      if (insertError && String((insertError as any)?.code || "") !== "23505") {
        console.warn("[AUDITOR_SUCCESS_HE] billing event insert warning", {
          eventId,
          error: (insertError as any)?.message,
        })
      }
    } catch (error) {
      console.warn("[AUDITOR_SUCCESS_HE] billing event insert exception", { eventId, error })
    }

    try {
      await processCardcomIndicatorEvent(admin as any, eventId, { query })
    } catch (error) {
      console.warn("[AUDITOR_SUCCESS_HE] immediate payment processing failed", {
        eventId,
        error,
      })
    }
  }

  redirect("/auditor/dashboard")
}
