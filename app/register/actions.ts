"use server";

import { createClient } from "@/lib/supabase/server";

export type CheckEmailResult = 
  | { exists: true; message: string }
  | { exists: false }
  | { error: true; message: string };

/**
 * Check if an email is already registered in the system
 * This runs on the server only - safe to use Supabase client
 * 
 * Returns:
 * - { exists: true } if email is taken
 * - { exists: false } if email is available
 * - { error: true } if there was a network/server error
 */
export async function checkEmailExists(email: string): Promise<CheckEmailResult> {
  try {
    // Validate email format first
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: true, message: "כתובת אימייל לא תקינה" };
    }

    const supabase = await createClient();

    // Check if email exists in companies table
    // This is the authoritative source since every user has a company
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      console.error("Error checking email existence:", error);
      return { 
        error: true, 
        message: "לא ניתן לאמת את האימייל כרגע. נסה שוב." 
      };
    }

    // If data exists, email is taken
    if (data) {
      return { 
        exists: true, 
        message: "כתובת האימייל כבר רשומה במערכת" 
      };
    }

    // Email is available
    return { exists: false };

  } catch (err) {
    console.error("Unexpected error in checkEmailExists:", err);
    return { 
      error: true, 
      message: "אירעה שגיאה לא צפויה. נסה שוב." 
    };
  }
}
