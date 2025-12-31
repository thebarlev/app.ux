"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { revalidatePath } from "next/cache";

/**
 * מחזיר את ה-company_id של המשתמש המחובר (דרך טבלת company_members)
 */
async function getMyCompanyId() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("getMyCompanyId error:", error);
    throw new Error("No company found for this user");
  }

  return data.company_id;
}

export type BusinessDetailsPayload = {
  company_name: string;
  business_type: "osek_patur" | "osek_murshe" | "ltd" | "partnership" | "other";
  company_number: string;
  industry: string;
  custom_industry: string;
  street: string;
  city: string;
  postal_code: string;
  address: string;
  phone: string;
  mobile_phone: string;
  email: string;
  website: string;
};

/**
 * עדכון פרטי עסק לחברה של המשתמש
 */
export async function updateBusinessDetailsAction(payload: BusinessDetailsPayload) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { error } = await supabase
      .from("companies")
      .update({
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
        email: payload.email,
        website: payload.website,
      })
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
 * העלאת לוגו עסק ל-Supabase Storage
 */
export async function uploadLogoAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

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
    const companyId = await getCompanyIdForUser();

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
    const filePath = `signatures/${companyId}/${fileName}`;

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
    const companyId = await getCompanyIdForUser();

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

    // מוחקים מה-Storage (אותו path כמו למעלה, בהתאם למה שהעלית)
    const filePath = `signatures/${companyId}/signature.png`;
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
