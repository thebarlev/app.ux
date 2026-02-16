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

const FROM_ID = (process.env.FROM_ID || "").trim()
const TO_ID = (process.env.TO_ID || "").trim()
if (!FROM_ID || !TO_ID) die('Set FROM_ID and TO_ID')

const { data: u, error: eU } = await sb.auth.admin.getUserById(TO_ID)
if (eU) die("getUserById(TO_ID) failed: " + eU.message)
const toEmail = u?.user?.email || ""
if (!toEmail) die("TO_ID has no email")

const { data: row, error: e1 } = await sb
  .from("system_admins")
  .select("id,email,auth_user_id")
  .eq("auth_user_id", FROM_ID)
  .maybeSingle()

if (e1) die("read system_admins failed: " + e1.message)
if (!row) die("No system_admins row found for FROM_ID")

const { error: e2 } = await sb
  .from("system_admins")
  .update({ auth_user_id: TO_ID, email: toEmail })
  .eq("id", row.id)

if (e2) die("update system_admins failed: " + e2.message)

console.log("✅ system_admins repointed")
console.log("row.id:", row.id)
console.log("new auth_user_id:", TO_ID)
console.log("new email:", toEmail)
