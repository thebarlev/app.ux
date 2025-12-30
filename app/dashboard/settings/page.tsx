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
    
    // Fetch company data with all settings
    const { data: company, error } = await supabase
      .from("companies")
      .select(`
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
        email,
        website,
        logo_url,
        signature_url
      `)
      .eq("id", companyId)
      .single();

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

    return <SettingsClient company={company} />;
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
