"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Get a specific global setting value (system admin only)
 */
export async function getGlobalSettingAction(settingKey: string) {
  try {
    const supabase = await createClient();
    
    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false as const, message: "not_authenticated" };

    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!adminData) {
      return { ok: false as const, message: "not_authorized" };
    }

    // Fetch setting
    const { data, error } = await supabase
      .from("global_settings")
      .select("setting_value")
      .eq("setting_key", settingKey)
      .maybeSingle();

    if (error) return { ok: false as const, message: error.message };
    
    return {
      ok: true as const,
      value: data?.setting_value ?? "",
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Update a specific global setting (system admin only)
 */
export async function updateGlobalSettingAction(settingKey: string, settingValue: string) {
  try {
    const supabase = await createClient();
    
    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false as const, message: "not_authenticated" };

    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!adminData) {
      return { ok: false as const, message: "not_authorized" };
    }

    // Update or insert setting
    const { error } = await supabase
      .from("global_settings")
      .upsert({
        setting_key: settingKey,
        setting_value: settingValue,
        updated_at: new Date().toISOString(),
        updated_by: adminData.id,
      }, {
        onConflict: "setting_key"
      });

    if (error) return { ok: false as const, message: error.message };

    revalidatePath("/admin");
    
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Get receipt footer text for display (any authenticated user)
 */
export async function getReceiptFooterTextAction() {
  try {
    const supabase = await createClient();
    
    // This is a public setting that all users can read
    const { data, error } = await supabase
      .from("global_settings")
      .select("setting_value")
      .eq("setting_key", "receipt_footer_text")
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch receipt footer:", error);
      return { ok: true as const, value: "" }; // Fail gracefully
    }
    
    return {
      ok: true as const,
      value: data?.setting_value ?? "",
    };
  } catch (e: any) {
    console.error("Error in getReceiptFooterTextAction:", e);
    return { ok: true as const, value: "" }; // Fail gracefully
  }
}
