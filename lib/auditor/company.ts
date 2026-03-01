import type { SupabaseClient } from "@supabase/supabase-js"

type RpcRow = { company_id?: string } | Record<string, unknown>

function pickCompanyIdFromRow(row: RpcRow): string | null {
  const v = (row as any)?.company_id
  return typeof v === "string" && v.trim() ? v : null
}

export async function getFirstCompanyIdForAuditor(supabase: SupabaseClient): Promise<string | null> {
  // 1) Try existing RPC (if your Supabase exposes it as RPC in some envs)
  try {
    const { data, error } = await supabase.rpc("user_company_ids")
    if (!error && Array.isArray(data) && data.length > 0) {
      const first = pickCompanyIdFromRow(data[0] as any)
      if (first) return first
    }
  } catch (e) {
    // ignore and fallback
  }

  // 2) Fallback: company_members by current user
  // Works if RLS allows members to read their memberships (common)
  const cm = await (supabase as any)
    .from("company_members")
    .select("company_id")
    .limit(1)

  if (cm?.error) {
    console.error("[auditor] fallback company_members failed", {
      message: cm.error.message,
      code: cm.error.code,
    })
  } else {
    const first = cm?.data?.[0]?.company_id
    if (typeof first === "string" && first.trim()) return first
  }

  // 3) Fallback: companies.auth_user_id == current user
  const c = await (supabase as any)
    .from("companies")
    .select("id")
    .limit(1)

  if (c?.error) {
    console.error("[auditor] fallback companies failed", {
      message: c.error.message,
      code: c.error.code,
    })
    return null
  }

  const id = c?.data?.[0]?.id
  return typeof id === "string" && id.trim() ? id : null
}