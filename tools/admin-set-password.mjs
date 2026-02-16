import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

function readEnv(name) {
  const txt = readFileSync(".env.local", "utf-8")
  const line = txt.split("\n").find((l) => l.startsWith(name + "="))
  return line ? line.split("=").slice(1).join("=").trim() : ""
}

const SUPABASE_URL = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_ROLE = readEnv("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env vars")
  process.exit(1)
}

const USER_ID = process.env.USER_ID
const NEW_PASSWORD = process.env.NEW_PASSWORD

if (!USER_ID || !NEW_PASSWORD) {
  console.error("Set USER_ID and NEW_PASSWORD")
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await sb.auth.admin.updateUserById(USER_ID, {
  password: NEW_PASSWORD,
})

if (error) {
  console.error("ERROR:", error.message)
  process.exit(1)
}

console.log("✅ Password updated")
