import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { AuditorSuccessClient } from "@/components/auditor/AuditorSuccessClient"
import { processCardcomIndicatorEvent } from "@/lib/auditor/billing/process-indicator-event"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


export default async function EnAuditorSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  // AUDITOR BLOCKED — first statement executed in this component.
  if (AUDITOR_BLOCKED) notFound()

  const cfg = getAuditorConfig()
  if (!cfg.enabled) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (typeof value === "string" && value.trim()) params.set(key, value)
    }
    const returnTo = params.toString() ? `/en/auditor/success?${params.toString()}` : "/en/auditor/success"
    redirect(`/en/auditor/login?returnTo=${encodeURIComponent(returnTo)}`)
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
        console.warn("[AUDITOR_SUCCESS] billing event insert warning", {
          eventId,
          error: (insertError as any)?.message,
        })
      }
    } catch (error) {
      console.warn("[AUDITOR_SUCCESS] billing event insert exception", { eventId, error })
    }

    try {
      await processCardcomIndicatorEvent(admin as any, eventId, { query })
    } catch (error) {
      console.warn("[AUDITOR_SUCCESS] immediate payment processing failed", {
        eventId,
        error,
      })
    }
  }

  return <AuditorSuccessClient basePath="/en/auditor" />
}
