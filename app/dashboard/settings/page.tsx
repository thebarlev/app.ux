import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  
  // Authenticate user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get user's company
  try {
    const companyId = await getCompanyIdForUser();
    
    // Fetch company data with all settings.
    // Some deployments may not have optional English columns yet (company_name_en, contact_first_name_en).
    // We'll try the full select first, and on 42703 retry without EN columns.
    const selectWithEnglish = `
        id,
        company_name,
        company_name_en,
        business_type,
        company_number,
        industry,
        custom_industry,
        street,
        city,
        postal_code,
        registration_number,
        address,
        phone,
        mobile_phone,
        contact_first_name,
        contact_first_name_en,
        books_region,
        notified_tax_officer_at,
        notified_tax_officer_notes,
        email,
        website,
        logo_url,
        signature_url
      `;

    const selectWithoutEnglish = `
        id,
        company_name,
        business_type,
        company_number,
        industry,
        custom_industry,
        street,
        city,
        postal_code,
        registration_number,
        address,
        phone,
        mobile_phone,
        contact_first_name,
        books_region,
        notified_tax_officer_at,
        notified_tax_officer_notes,
        email,
        website,
        logo_url,
        signature_url
      `;

    let company: any = null;
    let error: any = null;

    // Attempt 1: with EN columns
    const r1 = await supabase.from("companies").select(selectWithEnglish).eq("id", companyId).single();
    company = r1.data;
    error = r1.error;

    // Retry on missing optional EN columns
    const msg = (error?.message || "") as string;
    const code = (error?.code || "") as string;
    const missingEnglishCols = msg.includes("company_name_en") || msg.includes("contact_first_name_en");
    if (error && code === "42703" && missingEnglishCols) {
      const r2 = await supabase.from("companies").select(selectWithoutEnglish).eq("id", companyId).single();
      company = r2.data;
      error = r2.error;
    }

    // Fetch available templates
    const { data: templates } = await supabase
      .from("templates")
      .select("id, name, description, thumbnail_url, is_default, company_id")
      .eq("is_active", true)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .eq("document_type", "receipt")
      .order("is_default", { ascending: false })
      .order("name");

    if (error || !company) {
      return (
        <div dir="rtl" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            שגיאה בטעינת נתוני העסק
          </div>
          <div style={{ color: "#6b7280" }}>
            {error?.message || "לא נמצאו נתוני חברה"}
          </div>
        </div>
      );
    }

    return (
      <SettingsClient 
        company={company} 
        initialTemplates={templates || []}
      />
    );
  } catch (error: any) {
    return (
      <div dir="rtl" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: "#dc2626" }}>
          שגיאה
        </div>
        <div style={{ color: "#6b7280" }}>
          {error?.message || "אירעה שגיאה בטעינת ההגדרות"}
        </div>
      </div>
    );
  }
}
