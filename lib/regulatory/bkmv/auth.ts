import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CompanyRole = "owner" | "admin" | "accountant";

export async function assertCompanyRoleAccess(params: {
  companyId: string;
  allowedRoles: CompanyRole[];
}): Promise<{ userId: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("unauthorized");
  }

  // 1) company_members (preferred)
  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", params.companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    // Fall through to owner check; do not leak errors to caller here.
  }

  if (membership?.role && params.allowedRoles.includes(membership.role as CompanyRole)) {
    return { userId: user.id };
  }

  // 2) direct owner fallback: companies.auth_user_id
  const { data: ownerCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("id", params.companyId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (ownerCompany?.id && params.allowedRoles.includes("owner")) {
    return { userId: user.id };
  }

  throw new Error("forbidden");
}

