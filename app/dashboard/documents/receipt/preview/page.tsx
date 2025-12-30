import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { getReceiptStyleSettingsPublic } from "@/app/admin/receipt-style/actions";
import PreviewClient from "./PreviewClient";

async function PreviewDataLoader({ searchParams }: { searchParams: any }) {
  const supabase = await createClient();
  
  // Await searchParams in Next.js 16
  const params = await searchParams;
  
  // Get customer ID from search params
  const customerId = params.customerId || null;
  
  let customerData = null;
  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select("name, email, phone, mobile, address_street, address_city, address_zip, tax_exempt, tax_id")
      .eq("id", customerId)
      .maybeSingle();
    
    customerData = data;
  }
  
  // Get company data
  let companyData = null;
  try {
    const companyId = await getCompanyIdForUser();
    const { data } = await supabase
      .from("companies")
      .select("company_name, business_type, registration_number, address, phone, mobile_phone, email, website, logo_url, signature_url")
      .eq("id", companyId)
      .maybeSingle();
    
    companyData = data;
  } catch (e) {
    console.error("Failed to fetch company data:", e);
  }
  
  // Get receipt style settings
  const styleSettings = await getReceiptStyleSettingsPublic();
  
  return <PreviewClient customerData={customerData} companyData={companyData} styleSettings={styleSettings} />;
}

export default async function ReceiptPreviewPage({ searchParams }: { searchParams: any }) {
  // Await searchParams in Next.js 16
  const params = await searchParams;
  
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>טוען...</div>}>
      <PreviewDataLoader searchParams={params} />
    </Suspense>
  );
}
