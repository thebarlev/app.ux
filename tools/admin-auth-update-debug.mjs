import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

function readEnv(name) {
  const txt = readFileSync(".env.local", "utf-8")
  const line = txt.split("\n").find((l) => l.startsWith(name + "="))
  return line ? line.split("=").slice(1).join("=").trim() : ""
}
function die(msg){ console.error(msg); process.exit(1) }

const SUPABASE_URL = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_ROLE = readEnv("SUPABASE_SERVICE_ROLE_KEY")
if (!SUPABASE_URL) die("Missing SUPABASE_URL")
if (!SERVICE_ROLE) die("Missing SUPABASE_SERVICE_ROLE_KEY")

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken:false, persistSession:false } })

const USER_ID = (process.env.USER_ID || "").trim()
const NEW_EMAIL = (process.env.NEW_EMAIL || "").trim()
const NEW_PASSWORD = (process.env.NEW_PASSWORD || "").trim()
if (!USER_ID) die('Set USER_ID')
if (!NEW_EMAIL && !NEW_PASSWORD) die('Set NEW_EMAIL and/or NEW_PASSWORD')

const update = {}
if (NEW_EMAIL) { update.email = NEW_EMAIL; update.email_confirm = true }
if (NEW_PASSWORD) { update.password = NEW_PASSWORD }

const res = await sb.auth.admin.updateUserById(USER_ID, update)
console.log("ERROR_OBJECT:", res.error ? JSON.stringify(res.error, null, 2) : "(none)")
console.log("OK:", !res.error)
