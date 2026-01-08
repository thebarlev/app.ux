import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Create Supabase admin client using service role key
 * This bypasses RLS and should ONLY be used server-side
 * 
 * ⚠️ SECURITY: Never expose SUPABASE_SERVICE_ROLE_KEY to client-side code
 * 
 * Environment variables (with fallback):
 * - SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL (required)
 * - SUPABASE_SERVICE_ROLE_KEY (required)
 */
export function createAdminClient() {
  // Use SUPABASE_URL first, fallback to NEXT_PUBLIC_SUPABASE_URL
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Build detailed error message with missing variables
  const missingVars: string[] = []
  if (!supabaseUrl) {
    missingVars.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)")
  }
  if (!serviceRoleKey) {
    missingVars.push("SUPABASE_SERVICE_ROLE_KEY")
  }

  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables for admin client: ${missingVars.join(", ")}. ` +
      `Please check your .env.local file and restart the server.`
    console.error("[createAdminClient]", errorMessage)
    throw new Error(errorMessage)
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
