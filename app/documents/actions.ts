"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * מחזיר את ה-company_id של המשתמש המחובר
 */
async function getMyCompanyId() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: company, error } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!company) throw new Error("Company not found");

  return company.id as string;
}

export async function lockStartingNumberAction(params: {
  documentType: string;
  startingNumber: number;
  prefix?: string | null;
}) {
  const supabase = await createClient();
  const companyId = await getMyCompanyId();

  const { data, error } = await supabase.rpc("lock_sequence_start", {
    p_company_id: companyId,
    p_document_type: params.documentType,
    p_starting_number: params.startingNumber,
    p_prefix: params.prefix ?? null,
    p_created_by: null,
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, sequence: data };
}
