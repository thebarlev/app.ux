import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuditorConfig, isAuditorAllowedEmail, type AuditorConfig } from "./env"
import { getFirstCompanyIdForAuditor } from "./company"

export type AuditorApiContext = {
  config: AuditorConfig
  user: { id: string; email: string | null }
  companyId: string
}

export function auditorNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 })
}

export function auditorForbidden(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 403 })
}

export function auditorUnauthorized(message: string = "Unauthorized"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 401 })
}

export async function requireAuditorApiAccess(): Promise<AuditorApiContext | NextResponse> {
  const config = getAuditorConfig()
  if (!config.enabled) return auditorNotFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return auditorUnauthorized("משתמש לא מחובר")

  const email = typeof user.email === "string" ? user.email : null
  if (!isAuditorAllowedEmail(email)) return auditorForbidden("אין הרשאה")

  const companyId = await getFirstCompanyIdForAuditor(supabase as any)
  if (!companyId) return auditorUnauthorized("לא נמצאה חברה פעילה")

  return {
    config,
    user: { id: user.id, email },
    companyId,
  }
}

