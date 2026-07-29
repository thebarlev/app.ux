import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { getShaamEnvSafe } from "@/lib/shaam/config"
import ShaamIntegrationClient from "./ShaamIntegrationClient"

type SafeConnection = {
  company_id: string
  provider: string
  issued_at: string
  expires_at: string
  connected_at: string
  last_refresh_at: string | null
  revoked_at: string | null
  scopes: string | null
  status: "active" | "expired" | "revoked" | "error"
  last_error_code: string | null
  last_error_message: string | null
}

export default async function ShaamIntegrationPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const companyId = await resolveCurrentCompanyId()

  const { data } = await supabase
    .from("company_shaam_connections_safe")
    .select(
      "company_id, provider, issued_at, expires_at, connected_at, last_refresh_at, revoked_at, scopes, status, last_error_code, last_error_message"
    )
    .eq("company_id", companyId)
    .eq("env", getShaamEnvSafe())
    .maybeSingle()

  const shaamEnv = getShaamEnvSafe()

  return <ShaamIntegrationClient connection={(data as SafeConnection) || null} shaamEnv={shaamEnv} />
}

