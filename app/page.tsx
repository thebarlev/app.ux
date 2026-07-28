import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * The app root is the login page.
 *
 * app.uxellent.com is the product, not a marketing site — uxellent.com covers
 * that — so landing on / should put you in front of the sign-in form rather
 * than the magic-link landing that used to live here. HomeLanding stays in the
 * tree; nothing routes to it any more.
 *
 * Signed-in visitors go to the dashboard instead. LoginForm has no
 * already-authenticated check of its own, so sending everyone to /login would
 * leave someone with a live session staring at a sign-in form on a URL they
 * may well have bookmarked.
 */
export default async function Page() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? "/dashboard" : "/login")
}
