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
export async function getSequenceInfoAction(params: { documentType: string }) {
  const supabase = await createClient();
  const companyId = await getMyCompanyId();

  // 1) האם כבר יש מסמך issued?
  const { data: issued, error: issuedErr } = await supabase
    .from("documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("document_type", params.documentType)
    .eq("status", "issued")
    .limit(1);

  if (issuedErr) throw issuedErr;

  const hasIssued = (issued?.length ?? 0) > 0;

  // 2) להביא sequence דרך RPC (כדי לעקוף RLS על document_sequences)
  const { data, error } = await supabase.rpc("get_sequence_info", {
    p_company_id: companyId,
    p_document_type: params.documentType,
  });

  if (error) throw error;

  // 3) נרמול: RPC לפעמים מחזיר array ולפעמים object
  const row = Array.isArray(data) ? data[0] : data;

  const isLocked = Boolean(row?.is_locked);
  const currentNumber =
    typeof row?.current_number === "number" ? row.current_number : null;

  const nextNumber = currentNumber !== null ? currentNumber + 1 : null;
  const prefix = row?.prefix ?? null;

  // ✅ הלוגיקה הנכונה למודאל
  const sequenceExists = Boolean(row);
  const shouldShowModal = !hasIssued && (!sequenceExists || !isLocked);

  return {
    hasIssued,
    isLocked,
    currentNumber,
    nextNumber,
    prefix,
    shouldShowModal,
  };
}
