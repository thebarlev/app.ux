/**
 * Shared Receipt Style Module
 * 
 * This module provides receipt style settings functionality
 * for both admin and dashboard routes.
 * 
 * Architecture: Shared library - safe to import from any route
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  ReceiptStyleSettings, 
  DEFAULT_RECEIPT_STYLE,
  validateReceiptStyleSettings 
} from "@/lib/types/receipt-style";

/**
 * Get receipt style settings for public use (preview, PDF generation)
 * 
 * No authentication required - returns defaults if not found.
 * Safe fallback: Never throws, always returns valid settings.
 * 
 * @returns Promise<ReceiptStyleSettings> - Style settings or defaults
 */
export async function getReceiptStyleSettingsPublic(): Promise<ReceiptStyleSettings> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("receipt_style_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[receipt-style] Database query error, using defaults:", error.message);
      return DEFAULT_RECEIPT_STYLE;
    }

    if (!data?.settings) {
      console.log("[receipt-style] No settings found, using defaults");
      return DEFAULT_RECEIPT_STYLE;
    }

    console.log("[receipt-style] Loaded settings from database");
    return data.settings as ReceiptStyleSettings;
  } catch (e) {
    console.error("[receipt-style] Unexpected error, using defaults:", e);
    return DEFAULT_RECEIPT_STYLE;
  }
}

/**
 * Get receipt style settings with admin authentication
 * 
 * Used by admin panel for editing settings.
 * 
 * @returns Promise with ok status and settings/message
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
      console.error("[receipt-style] Error fetching settings:", error);
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
 * Save/update receipt style settings (admin only)
 * 
 * @param settings - Receipt style settings to save
 * @returns Promise with ok status and optional message
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
        message: "הגדרות לא תקינות:\n" + validation.errors.join("\n") 
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
        console.error("[receipt-style] Update error:", error);
        return { ok: false, message: "שגיאה בעדכון ההגדרות" };
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from("receipt_style_settings")
        .insert({ settings: settings as any });

      if (error) {
        console.error("[receipt-style] Insert error:", error);
        return { ok: false, message: "שגיאה ביצירת ההגדרות" };
      }
    }

    return { ok: true, message: "ההגדרות נשמרו בהצלחה" };
  } catch (e: any) {
    console.error("[receipt-style] Save error:", e);
    return { ok: false, message: e?.message || "שגיאה לא צפויה" };
  }
}

/**
 * Reset to default settings (admin only)
 * 
 * @returns Promise with ok status and optional message
 */
export async function resetReceiptStyleSettings(): Promise<{
  ok: boolean;
  message?: string;
}> {
  return saveReceiptStyleSettings(DEFAULT_RECEIPT_STYLE);
}
