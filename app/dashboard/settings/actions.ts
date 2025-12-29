"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { revalidatePath } from "next/cache";

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
 * Upload company logo to Supabase Storage
 */
export async function uploadLogoAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const file = formData.get("logo") as File;
    if (!file) {
      return { ok: false as const, message: "no_file_provided" };
    }

    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return { ok: false as const, message: "invalid_file_type" };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false as const, message: "file_too_large" };
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
          ok: false as const, 
          message: "Storage bucket 'business-assets' not found. Please create it in Supabase Dashboard > Storage. See STORAGE_SETUP_GUIDE.md for instructions." 
        };
      }
      return { ok: false as const, message: uploadError.message };
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
      return { ok: false as const, message: "no_logo_to_delete" };
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
