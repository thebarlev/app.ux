import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Guard: ensure the user has a company (owner via auth_user_id OR member via company_members).
  // This allows system admins / team members (e.g. itzik@uxellent.com) who are members
  // but not owners to access the dashboard and see invoices.
  try {
    await getCompanyIdForUser();
  } catch {
    redirect("/register");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
