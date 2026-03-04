import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

/**
 * Get current user ID from Supabase session.
 * Use this instead of relying on user_company_ids() RPC when the session
 * may not be fully hydrated (auth.uid() returns null on initial load).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Get company IDs for a user. Primary: companies.auth_user_id (owner).
 * Fallback: company_members (for multi-user companies).
 * Do NOT rely on user_company_ids() RPC when session may be stale.
 */
export async function getCompanyIdsForUser(
  supabase: SupabaseClient,
  userId: string | null
): Promise<string[]> {
  if (!userId) return []

  const ids: string[] = []

  // Primary: companies where user is owner (auth_user_id)
  const { data: owned } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", userId)
  for (const c of owned || []) {
    if ((c as any)?.id) ids.push(String((c as any).id))
  }

  // Fallback: company_members (multi-user companies)
  if (ids.length === 0) {
    const { data: members } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
    for (const m of members || []) {
      if ((m as any)?.company_id) ids.push(String((m as any).company_id))
    }
  }

  return [...new Set(ids)]
}
