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

let page = 1
while (page <= 10) {
  const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  const users = data?.users || []

  for (const u of users) {
    if ((u.email || "").toLowerCase() === "itzik@uxellent.com") {
      console.log("MATCH:", u.id, "providers:", u.app_metadata?.providers)
    }
  }

  if (users.length < 200) break
  page++
}
