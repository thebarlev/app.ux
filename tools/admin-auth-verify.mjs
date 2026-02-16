import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

function readEnv(name) {
  const txt = readFileSync(".env.local", "utf-8")
  const line = txt.split("\n").find((l) => l.startsWith(name + "="))
  return line ? line.split("=").slice(1).join("=").trim() : ""
}
function maskEmail(e="") {
  const [u,d] = e.split("@")
  if (!d) return e ? e.slice(0,2) + "…" : ""
  return (u?.slice(0,2) || "") + "…@" + d
}
function die(msg){ console.error(msg); process.exit(1) }

const SUPABASE_URL = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_ROLE = readEnv("SUPABASE_SERVICE_ROLE_KEY")
if (!SUPABASE_URL) die("Missing SUPABASE_URL")
if (!SERVICE_ROLE) die("Missing SUPABASE_SERVICE_ROLE_KEY")

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken:false, persistSession:false } })

const { data: admins, error: e1 } = await sb.from("system_admins").select("email,auth_user_id").limit(5)
if (e1) die("system_admins read failed: " + e1.message)
if (!admins || admins.length === 0) die("No admins in system_admins")

const a = admins[0]
console.log("system_admins.email =", maskEmail(a.email||""))
console.log("auth_user_id      =", a.auth_user_id)

const { data: u, error: e2 } = await sb.auth.admin.getUserById(a.auth_user_id)
if (e2) die("auth getUserById failed: " + e2.message)

const user = u?.user
console.log("auth.email        =", maskEmail(user?.email || ""))
console.log("email_confirmed   =", !!user?.email_confirmed_at)
console.log("providers         =", (user?.app_metadata?.providers || []).join(",") || "(unknown)")
