"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type ManageAuthActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }

function clean(input: unknown): string {
  return typeof input === "string" ? input.trim() : ""
}

export async function updateAdminAuthAction(_prev: ManageAuthActionState, formData: FormData): Promise<ManageAuthActionState> {
  const emailRaw = clean(formData.get("email"))
  const email = emailRaw

  if (!email) {
    return { ok: false, message: "Please provide a new email." }
  }
  if (email) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) return { ok: false, message: "Invalid email format." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: "Unauthorized" }
  }

  // Admin-only (same table used in /admin/texts)
  const { data: adminRow } = await supabase
    .from("system_admins")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!adminRow) {
    return { ok: false, message: "Unauthorized" }
  }

  const admin = createAdminClient()

  const update: Record<string, any> = {
    email,
    email_confirm: true,
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, update)
  if (authErr) {
    return { ok: false, message: authErr.message || "Failed to update auth user" }
  }

  const { error: dbErr } = await admin
    .from("system_admins")
    .update({ email })
    .eq("auth_user_id", user.id)

  if (dbErr) {
    return { ok: false, message: `Auth updated, but failed to sync system_admins.email: ${dbErr.message}` }
  }

  return { ok: true, message: "Email updated successfully." }
}

export async function setAdminPasswordAction(_prev: ManageAuthActionState, formData: FormData): Promise<ManageAuthActionState> {
  const password = clean(formData.get("password"))
  if (!password) return { ok: false, message: "Please provide a new password." }
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: "Unauthorized" }
  }

  // Admin-only (same table used in /admin/texts)
  const { data: adminRow } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!adminRow) {
    return { ok: false, message: "Unauthorized" }
  }

  const admin = createAdminClient()
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, { password })
  if (authErr) {
    return { ok: false, message: authErr.message || "Failed to update password" }
  }

  return { ok: true, message: "Password updated successfully." }
}

