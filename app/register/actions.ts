"use server"

import { createClient } from "@/lib/supabase/server"

export async function getLegalTermsRequiredSetting(): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from("global_settings")
      .select("setting_value")
      .eq("setting_key", "require_legal_terms_acceptance_on_signup")
      .maybeSingle()

    if (error) {
      console.error("Error fetching legal terms setting:", error)
      return false // Default to not required if error
    }

    return data?.setting_value === "true"
  } catch (e: any) {
    console.error("Error in getLegalTermsRequiredSetting:", e)
    return false // Default to not required
  }
}

export async function getMarketingRequiredSetting(): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from("global_settings")
      .select("setting_value")
      .eq("setting_key", "require_marketing_acceptance_on_signup")
      .maybeSingle()

    if (error) {
      console.error("Error fetching marketing setting:", error)
      return false // Default to not required if error
    }

    return data?.setting_value === "true"
  } catch (e: any) {
    console.error("Error in getMarketingRequiredSetting:", e)
    return false // Default to not required
  }
}

export async function checkEmailExists(email: string): Promise<{ exists: boolean; message?: string } | { error: true; message: string }> {
  try {
    const supabase = await createClient()
    
    // בדיקה מול companies table (מקור האמת לאימיילים)
    const { data, error } = await supabase
      .from("companies")
      .select("email")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle()

    if (error) {
      console.error("Error checking email:", error)
      return { error: true, message: "שגיאה בבדיקת אימייל. נסה שוב." }
    }

    if (data) {
      return { 
        exists: true, 
        message: "כתובת האימייל כבר רשומה במערכת" 
      }
    }

    return { exists: false }
  } catch (e: any) {
    console.error("Error in checkEmailExists:", e)
    return { error: true, message: "שגיאה לא צפויה. נסה שוב." }
  }
}
