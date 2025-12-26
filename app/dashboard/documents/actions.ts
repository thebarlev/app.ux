"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * מחזיר את ה-company_id של המשתמש המחובר
 * לוגיקה נכונה לפי מודל של multi-users per company:
 *
 * auth.users → company_members → companies
 */
async function getMyCompanyId() {
  const supabase = await createClient();

  // 1) משיכת המשתמש
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;

  if (!userId) throw new Error("Not authenticated");

  // 2) משיכת החברה מתוך company_members (המודל הנכון)
  const { data: member, error: memberErr } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (memberErr) throw memberErr;

  if (!member || !member.company_id) {
    throw new Error("company_not_found");
  }

  return member.company_id as string;
}

/**
 * נועל מספר התחלה למספור
 */
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

/**
 * מחזיר מידע על המספור — האם נעול, המספר הבא, האם יש issued וכו'
 */
export async function getSequenceInfoAction(params: {
  documentType: string;
}) {
  const supabase = await createClient();
  const companyId = await getMyCompanyId();

  // 1) האם כבר קיימת קבלה/חשבונית שהונפקה?
  const { data: issued, error: issuedErr } = await supabase
    .from("documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("document_type", params.documentType)
    .eq("status", "issued")
    .limit(1);

  if (issuedErr) throw issuedErr;

  const hasIssued = (issued?.length ?? 0) > 0;

  // 2) הבאת sequence דרך RPC (מעקף RLS)
  const { data, error } = await supabase.rpc("get_sequence_info", {
    p_company_id: companyId,
    p_document_type: params.documentType,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  const isLocked = Boolean(row?.is_locked);
  const currentNumber =
    typeof row?.current_number === "number" ? row.current_number : null;

  const nextNumber = currentNumber !== null ? currentNumber + 1 : null;
  const prefix = row?.prefix ?? null;

  const sequenceExists = Boolean(row);

  // אם אין issued וגם אין מנעול → לפתוח מודאל
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
