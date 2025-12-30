"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  ReceiptStyleSettings, 
  DEFAULT_RECEIPT_STYLE,
  validateReceiptStyleSettings 
} from "@/lib/types/receipt-style";

/**
 * Get current receipt style settings
 * Returns defaults if none exist
 */
export async function getReceiptStyleSettings(): Promise<{
  ok: boolean;
  settings?: ReceiptStyleSettings;
  message?: string;
}> {
  try {
    const supabase = await createClient();

    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, message: "לא מחובר" };
    }

    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!adminData) {
      return { ok: false, message: "אין הרשאת admin" };
    }

    // Get settings
    const { data, error } = await supabase
      .from("receipt_style_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching receipt style settings:", error);
      return { ok: true, settings: DEFAULT_RECEIPT_STYLE };
    }

    if (!data) {
      return { ok: true, settings: DEFAULT_RECEIPT_STYLE };
    }

    return { ok: true, settings: data.settings as ReceiptStyleSettings };
  } catch (e: any) {
    return { ok: false, message: e?.message || "שגיאה לא צפויה" };
  }
}

/**
 * Get receipt style settings for public use (preview)
 * No auth required - returns defaults if not found
 */
export async function getReceiptStyleSettingsPublic(): Promise<ReceiptStyleSettings> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from("receipt_style_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();

    if (!data?.settings) {
      return DEFAULT_RECEIPT_STYLE;
    }

    return data.settings as ReceiptStyleSettings;
  } catch (e) {
    console.error("Error loading receipt style:", e);
    return DEFAULT_RECEIPT_STYLE;
  }
}

/**
 * Save/update receipt style settings (admin only)
 */
export async function saveReceiptStyleSettings(
  settings: ReceiptStyleSettings
): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    const supabase = await createClient();

    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, message: "לא מחובר" };
    }

    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!adminData) {
      return { ok: false, message: "אין הרשאת admin" };
    }

    // Validate settings
    const validation = validateReceiptStyleSettings(settings);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.join(", "),
      };
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from("receipt_style_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("receipt_style_settings")
        .update({ settings: settings as any })
        .eq("id", existing.id);

      if (error) {
        return { ok: false, message: error.message };
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from("receipt_style_settings")
        .insert({ settings: settings as any });

      if (error) {
        return { ok: false, message: error.message };
      }
    }

    return { ok: true, message: "הגדרות נשמרו בהצלחה" };
  } catch (e: any) {
    return { ok: false, message: e?.message || "שגיאה בשמירת ההגדרות" };
  }
}

/**
 * Reset to default settings (admin only)
 */
export async function resetReceiptStyleSettings(): Promise<{
  ok: boolean;
  message?: string;
}> {
  return saveReceiptStyleSettings(DEFAULT_RECEIPT_STYLE);
}
