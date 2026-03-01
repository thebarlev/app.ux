import type { SupabaseClient } from "@supabase/supabase-js"

export async function auditorLog(params: {
  scanId: string
  companyId: string | null
  level?: "debug" | "info" | "warn" | "error"
  message: string
  data?: Record<string, any>
  supabase: SupabaseClient
}) {
  const level = params.level ?? "info"
  const data = params.data ?? {}

  const { error } = await params.supabase.from("auditor_scan_logs").insert({
    scan_id: params.scanId,
    company_id: params.companyId,
    level,
    message: params.message,
    data,
  })
  if (error) {
    console.error("[auditor] failed to write log", { message: error.message, code: error.code })
  }
}

