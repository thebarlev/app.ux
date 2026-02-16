import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

function readEnv(name) {
  const txt = readFileSync(".env.local", "utf-8")
  const line = txt.split("\n").find((l) => l.startsWith(name + "="))
  return line ? line.split("=").slice(1).join("=").trim() : ""
}

const SUPABASE_URL = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_ROLE = readEnv("SUPABASE_SERVICE_ROLE_KEY")

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USER_ID = "00c62a31-e195-4775-8257-92d377887d71"

const { data, error } = await sb.auth.admin.getUserById(USER_ID)

console.log("ERROR:", error ? error.message : "(none)")
console.log("EMAIL:", data?.user?.email)
console.log("EMAIL_CONFIRMED:", !!data?.user?.email_confirmed_at)
console.log("PROVIDERS:", data?.user?.app_metadata?.providers)
