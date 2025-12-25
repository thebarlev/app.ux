import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // אם אין משתמש מחובר -> להעיף ללוגין
  if (!user) {
    redirect("/admin/login");
  }

  return <>{children}</>;
}

