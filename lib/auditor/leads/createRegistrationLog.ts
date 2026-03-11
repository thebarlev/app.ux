import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Fire-and-forget helper: inserts a row into auditor_registration_log
 * after a new Auditor user is created (self-register or Cardcom payment flow).
 *
 * Uses service-role client — safe to call from background jobs with no session.
 * All errors are caught and logged; they must never break the signup flow.
 */
export async function createRegistrationLog({
  email,
  name,
  companyName,
  website,
  source = "self_register",
}: {
  email: string
  name?: string | null
  companyName?: string | null
  website?: string | null
  source?: string
}): Promise<void> {
  try {
    const admin = createServiceRoleClient()
    await admin.from("auditor_registration_log").insert({
      email,
      name: name || null,
      company_name: companyName || null,
      website: website || null,
      source,
    })
  } catch (err) {
    console.error("[AUDITOR_REGISTRATION_LOG] failed to insert", err)
  }
}
