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

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken:false, persistSession:false },
})

const targetEmail = (process.env.CHECK_EMAIL || "").trim().toLowerCase()
if (!targetEmail) die('Set CHECK_EMAIL, e.g. CHECK_EMAIL="itzik@uxellent.com" node tools/admin-auth-email-exists.mjs')

let page = 1
let found = []
while (page <= 10) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) die("listUsers failed: " + error.message)
  const users = data?.users || []
  found.push(...users.filter(u => (u.email || "").toLowerCase() === targetEmail).map(u => u.id))
  if (users.length < 200) break
  page++
}

console.log("MATCHING_AUTH_USER_IDS:", found.length ? found.join(",") : "(none)")
