import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const userId = "a7632bf9-fb8d-46d4-9743-a0decb427102" // מהצילום שלך
const newEmail = "itzik@uxellent.com"
const newPassword = "TempStrongPass!2026" // שנה זמנית ואז תחליף אחרי כניסה

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
  email: newEmail,
  password: newPassword,
  email_confirm: true,
})

if (error) {
  console.error("FAILED:", error)
  process.exit(1)
}

console.log("OK:", { id: data.user.id, email: data.user.email })
