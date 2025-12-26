"use server";

import { createClient } from "@/lib/supabase/server";

// אם אצלך getMyCompanyId כבר קיים במקום אחר (כמו app/dashboard/documents/actions.ts)
// ואתה רוצה למחזר אותו, אפשר להחליף את הפונקציה למטה ב-import.
async function getMyCompanyIdOrThrow() {
  const supabase = await createClient();

  // נסיון הכי “סטנדרטי”: יש טבלת memberships / companies_users וכו’.
  // אם אצלך המבנה שונה, אל תדאג — אם זה ייכשל, תגיד לי מה השגיאה ונחבר לטבלה הנכונה.
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) throw new Error("not_authenticated");

  // נסיון 1: company_memberships (נפוץ)
  const m1 = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (m1.data?.company_id) return m1.data.company_id as string;

  // נסיון 2: companies.owner_id (נפוץ)
  const m2 = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (m2.data?.id) return m2.data.id as string;

  throw new Error("company_not_found");
}

export type ReceiptSettings = {
  allowedCurrencies: string[];
  defaultCurrency: string;
  language: "he" | "en";
  roundTotals: boolean;
};

export type InitialReceiptCreateData = {
  ok: true;
  companyId: string;
  companyName: string | null;
  sequenceLocked: boolean;
  nextNumberText: string; // "טיוטה" / "מספר יוקצה בעת הפקה" / "המספר הבא: X"
  settings: ReceiptSettings;
} | {
  ok: false;
  message: string;
};

export async function getInitialReceiptCreateData(): Promise<InitialReceiptCreateData> {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyIdOrThrow();

    // האם המספור נעול?
    const seq = await supabase
      .from("document_sequences")
      .select("id,current_number,starting_number,document_type")
      .eq("company_id", companyId)
      .eq("document_type", "receipt")
      .maybeSingle();

    const sequenceLocked = !!seq.data;

    // נסיון להביא שם חברה (אם יש companies)
    let companyName: string | null = null;
    const c = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
    companyName = (c.data?.name as string) ?? null;

    // הגדרות ברירת מחדל (כמו שביקשת: ₪/$/€ לפחות) :contentReference[oaicite:1]{index=1}
    const settings: ReceiptSettings = {
      allowedCurrencies: ["₪", "$", "€"],
      defaultCurrency: "₪",
      language: "he",
      roundTotals: false,
    };

    // תצוגת מספר: בטיוטה אין מספר. מספר מוקצה בעת הפקה. :contentReference[oaicite:2]{index=2}
    let nextNumberText = "מספר יוקצה בעת הפקה";
    if (sequenceLocked && typeof seq.data?.current_number === "number") {
      nextNumberText = `המספר הבא צפוי להיות: ${seq.data.current_number + 1}`;
    }

    return {
      ok: true,
      companyId,
      companyName,
      sequenceLocked,
      nextNumberText,
      settings,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

export type PaymentMethod =
  | "העברה בנקאית"
  | "Bit"
  | "PayBox"
  | "כרטיס אשראי"
  | "מזומן"
  | "צ׳ק"
  | "PayPal"
  | "Payoneer"
  | "Google Pay"
  | "Apple Pay"
  | "ביטקוין"
  | "אתריום"
  | "שובר BuyME"
  | "שובר מתנה"
  | "שווה כסף"
  | "V-CHECK"
  | "Colu"
  | "ניכוי במקור"
  | "ניכוי חלק עובד טל״א"
  | "ניכוי אחר";

export type PaymentRow = {
  method: PaymentMethod | "";
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
};

export type ReceiptDraftPayload = {
  documentType: "receipt";
  customerName: string;
  documentDate: string;
  description: string;
  payments: PaymentRow[];
  notes: string;
  footerNotes: string;
  currency: string;
  total: number;
  roundTotals: boolean;
  language: "he" | "en";
};

function validatePayload(p: ReceiptDraftPayload) {
  if (!p.customerName.trim()) return "חובה למלא שם לקוח.";
  if (!p.documentDate) return "חובה לבחור תאריך.";
  if (!Array.isArray(p.payments) || p.payments.length === 0) return "חובה להוסיף לפחות תקבול אחד.";
  for (const [i, row] of p.payments.entries()) {
    if (!row.method) return `שורת תקבול ${i + 1}: חובה לבחור אמצעי תשלום.`;
    if (!row.date) return `שורת תקבול ${i + 1}: חובה לבחור תאריך.`;
    if (!Number.isFinite(row.amount) || row.amount <= 0) return `שורת תקבול ${i + 1}: סכום חייב להיות גדול מ-0.`;
    if (!row.currency) return `שורת תקבול ${i + 1}: חובה לבחור מטבע.`;
  }
  return null;
}

// שמירת טיוטה: אין מספר מסמך :contentReference[oaicite:3]{index=3}
export async function saveReceiptDraftAction(payload: ReceiptDraftPayload) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getMyCompanyIdOrThrow();

  // ⚠️ הנחה: טבלת documents קיימת
  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "receipt",
      status: "draft",
      document_number: null,
      payload,
      currency: payload.currency,
      total: payload.total,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, id: data.id as string };
}

// הפקה: הקצאת מספר בעת הפקה בלבד :contentReference[oaicite:4]{index=4}
export async function issueReceiptAction(payload: ReceiptDraftPayload) {
  const err = validatePayload(payload);
  if (err) return { ok: false as const, message: err };

  const supabase = await createClient();
  const companyId = await getMyCompanyIdOrThrow();

  // ניסיון לקרוא RPC שמקצה מספר אטומית (אם קיימת)
  const alloc = await supabase.rpc("allocate_document_number", {
    p_company_id: companyId,
    p_document_type: "receipt",
  });

  if (alloc.error) {
    // אם אין RPC כזה, נחזיר שגיאה ברורה כדי שנדע מה חסר
    return {
      ok: false as const,
      message:
        "לא קיימת פונקציה allocate_document_number במסד הנתונים. צריך ליצור אותה או להשתמש במנגנון קיים.",
      details: alloc.error.message,
    };
  }

  const documentNumber = alloc.data;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "receipt",
      status: "issued",
      document_number: documentNumber,
      payload,
      currency: payload.currency,
      total: payload.total,
    })
    .select("id, document_number")
    .single();

  if (error) return { ok: false as const, message: error.message };

  return { ok: true as const, id: data.id as string, documentNumber: data.document_number as number };
}
