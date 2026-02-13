import "server-only"

import { createClient } from "@/lib/supabase/server"

// NOTE: Do NOT import from document/pdf/template helpers here.
// This module must stay lightweight & server-only.

function asUuidString(x: any): string | null {
  if (!x) return null
  const s = String(x).trim()
  if (!s) return null
  return s
}

/**
 * Phase 1 company resolution:
 * - Prefer current company from server-side membership (companies/company_members).
 * - Fallback to first from public.user_company_ids() deterministically.
 */
export async function resolveCurrentCompanyId(): Promise<string> {
  const supabase = await createClient()

  // 1) Try to resolve via company_members for the authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("unauthenticated")

  const { data: member, error: memberErr } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!memberErr && member?.company_id) {
    return String(member.company_id)
  }

  // 2) Fallback to rpc user_company_ids()
  const { data, error } = await supabase.rpc("user_company_ids")
  if (error) throw new Error("company_not_found")

  const ids = Array.isArray(data)
    ? ((data as any[]).map(asUuidString).filter(Boolean) as string[])
    : []

  if (ids.length === 0) throw new Error("company_not_found")

  ids.sort((a, b) => a.localeCompare(b))
  return ids[0]!
}
