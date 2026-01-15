"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getCompanyIdForUser(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .order("company_id", { ascending: true });

  if (membershipError) throw membershipError;
  const membershipCompanyIds = (memberships || []).map((m: any) => m.company_id).filter(Boolean) as string[];

  const { data: ownerCompany, error: ownerCompanyError } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", userId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownerCompanyError) throw ownerCompanyError;

  const candidateIds = Array.from(new Set([...(membershipCompanyIds || []), ...(ownerCompany?.id ? [ownerCompany.id] : [])]));

  if (candidateIds.length > 0) {
    // Prefer a company that actually has registration_number (business ID) since Settings requires it.
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, registration_number")
      .in("id", candidateIds);

    if (companiesError) throw companiesError;

    const withReg = (companies || []).filter((c: any) => Boolean(c?.registration_number && String(c.registration_number).trim().length > 0));
    const chosen = (withReg.length > 0 ? withReg : (companies || [])).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))[0];

    if (chosen?.id) return String(chosen.id);
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (companyError) throw companyError;
  if (company?.id) {
    return company.id;
  }

  throw new Error("company_not_found");
}

/**
 * מחזיר את ה-company_id של המשתמש המחובר
 * משתמש ב-helper המרכזי שבודק גם company_members וגם companies.auth_user_id
 */
async function getMyCompanyId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("not_authenticated");
  return await getCompanyIdForUser(user.id);
}

export type BusinessDetailsPayload = {
  company_name: string;
  company_name_en?: string;
  business_type: "osek_patur" | "osek_murshe" | "ltd" | "partnership" | "other";
  // Company identifier fields exist in DB but Settings does not update them via this action.
  company_number?: string;
  registration_number?: string;
  industry: string;
  custom_industry: string;
  street: string;
  city: string;
  postal_code: string;
  address: string;
  phone: string;
  mobile_phone: string;
  contact_first_name_en?: string;
  books_region?: "IL" | "OTHER";
  email: string;
  website: string;
};

/**
 * עדכון פרטי עסק לחברה של המשתמש
 */
export async function updateBusinessDetailsAction(payload: BusinessDetailsPayload) {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    const updatePayloadWithEnglish = {
      company_name: payload.company_name,
      company_name_en: payload.company_name_en || null,
      business_type: payload.business_type,
      industry: payload.industry,
      custom_industry: payload.custom_industry,
      street: payload.street,
      city: payload.city,
      postal_code: payload.postal_code,
      address: payload.address,
      phone: payload.phone,
      mobile_phone: payload.mobile_phone,
      contact_first_name_en: payload.contact_first_name_en || null,
      books_region: payload.books_region || null,
      // notified_tax_officer fields removed
      email: payload.email,
      website: payload.website,
    };

    const updatePayloadWithoutEnglish = {
      company_name: payload.company_name,
      business_type: payload.business_type,
      industry: payload.industry,
      custom_industry: payload.custom_industry,
      street: payload.street,
      city: payload.city,
      postal_code: payload.postal_code,
      address: payload.address,
      phone: payload.phone,
      mobile_phone: payload.mobile_phone,
      books_region: payload.books_region || null,
      // notified_tax_officer fields removed
      email: payload.email,
      website: payload.website,
    };

    const r1 = await supabase
      .from("companies")
      .update(updatePayloadWithEnglish)
      .eq("id", companyId)
      .select("id")
      .single();

    let data = r1.data;
    let error = r1.error;

    const msg = (error?.message || "") as string;
    const code = (error?.code || "") as string;
    const missingEnglishCols = msg.includes("company_name_en") || msg.includes("contact_first_name_en");
    if (error && code === "PGRST204" && missingEnglishCols) {
      const r2 = await supabase
        .from("companies")
        .update(updatePayloadWithoutEnglish)
        .eq("id", companyId)
        .select("id")
        .single();
      data = r2.data;
      error = r2.error;
    }

    if (error) {
      if (error.code === "PGRST116" || error.message.includes("0 rows")) {
        return { ok: false as const, message: "no_company_updated" };
      }
      return { ok: false as const, message: error.message };
    }

    if (!data?.id) {
      return { ok: false as const, message: "no_company_updated" };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * העלאת לוגו עסק ל-Supabase Storage
 */
export async function uploadLogoAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    const file = formData.get("logo") as File;
    if (!file) {
      return { ok: false as const, message: "no_file_provided" };
    }

    // בדיקת סוג קובץ
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return { ok: false as const, message: "invalid_file_type" };
    }

    // בדיקת גודל (עד 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false as const, message: "file_too_large" };
    }

    // מחיקת לוגו ישן אם קיים
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single();

    if (company?.logo_url) {
      const oldPath = `business-logos/${companyId}/logo.png`;
      await supabase.storage.from("business-assets").remove([oldPath]);
    }

    // העלאת לוגו חדש
    const fileExt = file.name.split(".").pop();
    const fileName = `logo.${fileExt}`;
    const filePath = `business-logos/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      if (
        uploadError.message.includes("Bucket not found") ||
        uploadError.message.includes("bucket")
      ) {
        return {
          ok: false as const,
          message:
            "Storage bucket 'business-assets' not found. Please create it in Supabase Dashboard > Storage. See STORAGE_SETUP_GUIDE.md for instructions.",
        };
      }
      return { ok: false as const, message: uploadError.message };
    }

    // URL ציבורי
    const { data: urlData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(filePath);

    // עדכון בטבלת companies
    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_url: urlData.publicUrl })
      .eq("id", companyId);

    if (updateError) {
      return { ok: false as const, message: updateError.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true as const, logoUrl: urlData.publicUrl };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * מחיקת לוגו עסק
 */
export async function deleteLogoAction() {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    const { data: company } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single();

    if (!company?.logo_url) {
      return { ok: false as const, message: "no_logo_to_delete" };
    }

    const filePath = `business-logos/${companyId}/logo.png`;
    await supabase.storage.from("business-assets").remove([filePath]);

    const { error } = await supabase
      .from("companies")
      .update({ logo_url: null })
      .eq("id", companyId);

    if (error) {
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * העלאת חתימת חברה ל-Supabase Storage
 */
export async function uploadCompanySignatureAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    // 1. קובץ מהטופס
    const file = formData.get("signature") as File | null;
    if (!file) {
      return { ok: false as const, message: "לא התקבל קובץ חתימה" };
    }

    // 2. ולידציה בסיסית
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return { ok: false as const, message: "סוג קובץ לא נתמך" };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false as const, message: "הקובץ גדול מדי (מעל 5MB)" };
    }

    // 3. העלאה ל-Storage
    const fileExt = file.name.split(".").pop() ?? "png";
    const fileName = `signature.${fileExt}`;
    const filePath = `business-signatures/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error("Supabase storage uploadError:", uploadError);
      if (
        uploadError.message.includes("Bucket not found") ||
        uploadError.message.includes("bucket")
      ) {
        return {
          ok: false as const,
          message:
            "Bucket בשם 'business-assets' לא קיים. יש ליצור אותו ב-Supabase Dashboard > Storage.",
        };
      }
      return { ok: false as const, message: uploadError.message };
    }

    // 4. URL ציבורי
    const {
      data: { publicUrl },
    } = supabase.storage.from("business-assets").getPublicUrl(filePath);

    // 5. עדכון שדה signature_url בטבלת companies
    const { error: updateError } = await supabase
      .from("companies")
      .update({ signature_url: publicUrl })
      .eq("id", companyId);

    if (updateError) {
      console.error("Supabase companies updateError:", updateError);

      if (
        updateError.message?.includes("row-level security") ||
        updateError.message?.includes("policy")
      ) {
        return {
          ok: false as const,
          message:
            "שגיאת הרשאות: יש להריץ את הסקריפט scripts/017-fix-companies-update-policy.sql במסד הנתונים.",
        };
      }

      if (
        updateError.message?.includes("column") &&
        updateError.message?.includes("signature_url")
      ) {
        return {
          ok: false as const,
          message:
            "העמודה signature_url לא קיימת. יש להריץ את הסקריפט scripts/016-add-signature-field.sql.",
        };
      }

      return { ok: false as const, message: updateError.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true as const, signatureUrl: publicUrl };
  } catch (e: any) {
    console.error("uploadCompanySignatureAction fatal error:", e);
    const errorMessage = e?.message || "unknown_error";
    return { ok: false as const, message: errorMessage };
  }
}

/**
 * ✅ תוספת חשובה:
 * נותן שם חלופי לפונקציה, כדי שקבצים שמייבאים uploadSignatureAction לא ישברו בבילד
 */
export const uploadSignatureAction = uploadCompanySignatureAction;

/**
 * מחיקת חתימת חברה
 */
export async function deleteSignatureAction() {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    // בודקים שיש בכלל חתימה
    let company: { signature_url: string | null } | null = null;
    try {
      const { data } = await supabase
        .from("companies")
        .select("signature_url")
        .eq("id", companyId)
        .single();
      company = data;
    } catch (selectError: any) {
      if (
        selectError?.message?.includes("column") &&
        selectError?.message?.includes("signature_url")
      ) {
        return {
          ok: false as const,
          message:
            "העמודה signature_url לא קיימת. יש להריץ את הסקריפט scripts/016-add-signature-field.sql.",
        };
      }
      throw selectError;
    }

    if (!company?.signature_url) {
      return { ok: false as const, message: "no_signature_to_delete" };
    }

    // מוחקים מה-Storage
    const filePath = `business-signatures/${companyId}/signature.png`;
    await supabase.storage.from("business-assets").remove([filePath]);

    // מעדכנים את הרשומה
    const { error } = await supabase
      .from("companies")
      .update({ signature_url: null })
      .eq("id", companyId);

    if (error) {
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}
