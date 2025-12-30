"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { revalidatePath } from "next/cache";

/**
 * מחזיר את ה-company_id של המשתמש המחובר
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
 * Update business details for the current user's company
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
      return { ok: false, message: error.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Upload company logo to Supabase Storage
 */
export async function uploadLogoAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const file = formData.get("logo") as File;
    if (!file) {
      return { ok: false, message: "no_file_provided" };
    }

    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return { ok: false, message: "invalid_file_type" };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, message: "file_too_large" };
    }

    // Delete old logo if exists
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single();

    if (company?.logo_url) {
      // Extract path from URL and delete old file
      const oldPath = `business-logos/${companyId}/logo.png`;
      await supabase.storage.from("business-assets").remove([oldPath]);
    }

    // Upload new logo
    const fileExt = file.name.split(".").pop();
    const fileName = `logo.${fileExt}`;
    const filePath = `business-logos/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      // Provide helpful error message if bucket doesn't exist
      if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("bucket")) {
        return { 
          ok: false, 
          message: "Storage bucket 'business-assets' not found. Please create it in Supabase Dashboard > Storage. See STORAGE_SETUP_GUIDE.md for instructions." 
        };
      }
      return { ok: false, message: uploadError.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(filePath);

    // Update company record with logo URL
    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_url: urlData.publicUrl })
      .eq("id", companyId);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true, logoUrl: urlData.publicUrl };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Delete company logo
 */
export async function deleteLogoAction() {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Get current logo URL
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single();

    if (!company?.logo_url) {
      return { ok: false, message: "no_logo_to_delete" };
    }

    // Delete from storage
    const filePath = `business-logos/${companyId}/logo.png`;
    await supabase.storage.from("business-assets").remove([filePath]);

    // Update company record
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
 * Upload company signature to Supabase Storage
 */
export async function uploadCompanySignatureAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getMyCompanyId();

    // 1. משיגים את הקובץ מהטופס
    const file = formData.get("signature") as File | null;
    if (!file) {
      return { ok: false, error: "לא התקבל קובץ חתימה" };
    }

    // 2. מעלים ל-Storage
    const path = `signatures/${companyId}/${Date.now()}-${file.name}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("business-assets") // שים לב: זה צריך להיות אותו bucket כמו הלוגו שלך
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase storage uploadError:", uploadError);
      return { ok: false, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("business-assets").getPublicUrl(path);

    // 3. מעדכנים את החתימה בטבלת companies
    const { error: updateError } = await supabase
      .from("companies")
      .update({ signature_url: publicUrl })
      .eq("id", companyId);

    if (updateError) {
      console.error("Supabase companies updateError:", updateError);
      return { ok: false, error: updateError.message };
    }

    return { ok: true, url: publicUrl };
  } catch (e: any) {
    console.error("uploadCompanySignatureAction fatal error:", e);
    return { ok: false, error: e?.message || "Unknown error" };
  }
}


    // Upload new signature
    const fileExt = file.name.split(".").pop();
    const fileName = `signature.${fileExt}`;
    const filePath = `business-signatures/${companyId}/${fileName}`;
    
    console.log("Uploading to path:", filePath);

    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("bucket")) {
        return { 
          ok: false as const, 
          message: "Storage bucket 'business-assets' not found. Please create it in Supabase Dashboard > Storage. See STORAGE_SETUP_GUIDE.md for instructions." 
        };
      }
      return { ok: false as const, message: uploadError.message };
    }
    
    console.log("Upload successful!");

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(filePath);
      
    console.log("Public URL:", urlData.publicUrl);

    // Update company record with signature URL
    console.log("Updating company record...");
    const { error: updateError } = await supabase
      .from("companies")
      .update({ signature_url: urlData.publicUrl })
      .eq("id", companyId);

    if (updateError) {
      console.error("Update error:", updateError.message, updateError);
      
      if (updateError.message?.includes("row-level security") || updateError.message?.includes("policy")) {
        return {
          ok: false as const,
          message: "שגיאת הרשאות: אנא הרץ את הסקריפט scripts/017-fix-companies-update-policy.sql במסד הנתונים."
        };
      }
      
      if (updateError.message?.includes("column") && updateError.message?.includes("signature_url")) {
        return {
          ok: false as const,
          message: "העמודה signature_url לא קיימת במסד הנתונים. אנא הרץ את הסקריפט: scripts/016-add-signature-field.sql"
        };
      }
      
      return { ok: false as const, message: updateError.message };
    }
    
    console.log("Database updated successfully!");

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    const successResult = { ok: true as const, signatureUrl: urlData.publicUrl };
    console.log("=== uploadSignatureAction SUCCESS ===");
    console.log("Returning:", successResult);
    return successResult;
  } catch (e: any) {
    console.error("=== uploadSignatureAction CAUGHT ERROR ===");
    console.error("Error type:", typeof e);
    console.error("Error:", e);
    console.error("Error message:", e?.message);
    console.error("Error stack:", e?.stack);
    
    const errorMessage = e?.message || (e ? String(e) : "unknown_error");
    const errorResult = { ok: false as const, message: errorMessage };
    console.log("Returning error:", errorResult);
    return errorResult;
  }
}

/**
 * Delete company signature
 */
export async function deleteSignatureAction() {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Get current signature URL (with error handling for missing column)
    let company;
    try {
      const { data } = await supabase
        .from("companies")
        .select("signature_url")
        .eq("id", companyId)
        .single();
      company = data;
    } catch (selectError: any) {
      if (selectError?.message?.includes("column") && selectError?.message?.includes("signature_url")) {
        return {
          ok: false,
          message: "העמודה signature_url לא קיימת במסד הנתונים. אנא הרץ את הסקריפט: scripts/016-add-signature-field.sql"
        };
      }
      throw selectError;
    }

    if (!company?.signature_url) {
      return { ok: false, message: "no_signature_to_delete" };
    }

    // Delete from storage
    const filePath = `business-signatures/${companyId}/signature.png`;
    await supabase.storage.from("business-assets").remove([filePath]);

    // Update company record
    const { error } = await supabase
      .from("companies")
      .update({ signature_url: null })
      .eq("id", companyId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "unknown_error" };
  }
}

