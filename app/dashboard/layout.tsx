import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Guard: ensure the user completed onboarding (has a company).
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!company?.id) {
    redirect("/register4")
  }

  return <DashboardShell>{children}</DashboardShell>;
}
