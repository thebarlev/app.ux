"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getLogoutRedirectUrl } from "@/lib/logout-redirect";

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const headersList = await headers();
  const referer = headersList.get("referer");
  redirect(getLogoutRedirectUrl(referer));
}
