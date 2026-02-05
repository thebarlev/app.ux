import "server-only"

import { createClient } from "@/lib/supabase/server"
import { logSecurityEvent } from "@/lib/security/audit-log"

type SystemAdminUser = {
  userId: string
  adminId: string
  email: string | null
}

export class SystemAdminAuthError extends Error {
  code: "unauthorized" | "forbidden"
  constructor(code: "unauthorized" | "forbidden") {
    super(code)
    this.code = code
  }
}

/**
 * Server-side guard for system-admin-only surfaces (debug, exports, ops).
 * Uses Supabase session cookies + `system_admins` table.
 */
export async function requireSystemAdmin(): Promise<SystemAdminUser> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logSecurityEvent({
      event: "admin_denied",
      outcome: "denied",
      userId: null,
      companyId: null,
      requestId: null,
      ip: null,
      path: null,
      meta: { reason: "not_authenticated" },
    })
    throw new SystemAdminAuthError("unauthorized")
  }

  const { data: admin, error } = await supabase
    .from("system_admins")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (error || !admin?.id) {
    logSecurityEvent({
      event: "admin_denied",
      outcome: "denied",
      userId: user.id,
      companyId: null,
      requestId: null,
      ip: null,
      path: null,
      meta: { reason: "not_system_admin" },
    })
    throw new SystemAdminAuthError("forbidden")
  }

  return { userId: user.id, adminId: admin.id, email: (admin as any)?.email ?? user.email ?? null }
}

