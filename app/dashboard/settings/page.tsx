import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  
  // Authenticate user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  async function getCompanyIdForUserDeterministic(userId: string): Promise<string> {
    const { data: memberships, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .order("company_id", { ascending: true });

    if (membershipError) throw membershipError;
    const membershipCompanyIds = (memberships || []).map((m: any) => m.company_id).filter(Boolean) as string[];

    const { data: ownerCompany, error: ownerCompanyError } = await supabase
      .from("companies")
      .select("id")
      .eq("auth_user_id", userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownerCompanyError) throw ownerCompanyError;

    const candidateIds = Array.from(new Set([...(membershipCompanyIds || []), ...(ownerCompany?.id ? [ownerCompany.id] : [])]));

    if (candidateIds.length > 0) {
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("id, registration_number")
        .in("id", candidateIds);
      if (companiesError) throw companiesError;

      const withReg = (companies || []).filter((c: any) => Boolean(c?.registration_number && String(c.registration_number).trim().length > 0));
      const chosen = (withReg.length > 0 ? withReg : (companies || [])).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))[0];

      if (chosen?.id) return String(chosen.id);
    }

    throw new Error("company_not_found");
  }

  // Get user's company
  try {
    const companyId = await getCompanyIdForUserDeterministic(user.id);
    
    // Fetch company data with all settings.
    // Some deployments may not have optional English columns yet (company_name_en, contact_first_name_en, english_address).
    // We'll try the full select first, and on 42703 retry without EN columns.
    const selectWithEnglish = `
        id,
        company_name,
        company_name_en,
        english_address,
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
    const missingEnglishCols =
      msg.includes("company_name_en") || msg.includes("contact_first_name_en") || msg.includes("english_address");
    if (error && code === "42703" && missingEnglishCols) {
      const r2 = await supabase.from("companies").select(selectWithoutEnglish).eq("id", companyId).single();
      company = r2.data;
      error = r2.error;
    }

    // Fetch available templates
    const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
    
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] settings/page.tsx - companyId:", companyId)
    }

    const { data: templates } = await supabase
      .from("templates")
      .select("id, name, description, thumbnail_url, is_default, company_id")
      .eq("is_active", true)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .eq("document_type", "receipt")
      .order("is_default", { ascending: false })
      .order("name");

    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] Query result:", { count: templates?.length || 0 })
    }

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

    // If Storage bucket is private, "publicUrl" may 403 in browser.
    // For Settings UI display only, prefer a signed URL when we can derive the storage path.
    const adminClient = createAdminClient();
    const extractStoragePath = (url: string | null | undefined): string | null => {
      if (!url) return null;
      // If full "public" URL, extract the object key after /business-assets/
      const m1 = String(url).match(/\/storage\/v1\/object\/public\/business-assets\/(.+)$/);
      if (m1?.[1]) return m1[1];
      // If it's already an object key
      if (String(url).startsWith("business-logos/") || String(url).startsWith("business-signatures/")) return String(url);
      // Generic extract of known folders
      const m2 = String(url).match(/(business-(logos|signatures)\/[^?#]+)/);
      if (m2?.[1]) return m2[1];
      return null;
    };

    const pickBucketForPath = (storagePath: string): string => {
      // Signatures must be stored in a private bucket.
      if (storagePath.startsWith("business-signatures/")) return SECURE_ASSETS_BUCKET;
      return PUBLIC_ASSETS_BUCKET;
    };

    const makeSignedUrl = async (storagePath: string | null): Promise<string | null> => {
      if (!storagePath) return null;
      const bucket = pickBucketForPath(storagePath);
      const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    };

    const logoStoragePath = extractStoragePath(company.logo_url);
    const signatureStoragePath = extractStoragePath(company.signature_url);
    const signedLogoUrl = await makeSignedUrl(logoStoragePath);
    const signedSignatureUrl = await makeSignedUrl(signatureStoragePath);

    const companyForClient = {
      ...company,
      logo_url: signedLogoUrl || company.logo_url,
      signature_url: signedSignatureUrl || company.signature_url,
    };

    return (
      <>
        {/* Minimal navigation entry (Phase 1): Integrations */}
        <div dir="rtl" className="ui-container pt-6">
          <div className="mb-4 rounded-[14px] border border-border/60 bg-white/80 p-4 flex items-center justify-between gap-4">
            <div className="text-right">
              <div className="text-sm text-muted-fg">אינטגרציות</div>
              <div className="font-semibold">ניהול חיבורים לשירותים חיצוניים</div>
            </div>
            <Link
              href="/dashboard/settings/integrations"
              className="inline-flex items-center justify-center rounded-[5px] h-[50px] px-5 text-[18px] font-medium text-white"
              style={{ backgroundColor: "#5389BB" }}
            >
              מעבר לאינטגרציות
            </Link>
          </div>
        </div>

        <SettingsClient company={companyForClient as any} initialTemplates={templates || []} />
      </>
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
