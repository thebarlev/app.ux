import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { getReceiptStyleSettingsPublic } from "@/lib/receipt-style";
import { getTemplateForDocument } from "@/lib/pdf-service";
import PreviewWrapper from "./PreviewWrapper";

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
  
  // Get company data and template
  let companyData = null;
  let templateHtml = null;
  let templateCss = null;
  
  try {
    const companyId = await getCompanyIdForUser();
    const { data } = await supabase
      .from("companies")
      .select("company_name, business_type, registration_number, company_number, address, street, city, postal_code, phone, mobile_phone, email, website, logo_url, signature_url")
      .eq("id", companyId)
      .maybeSingle();
    
    // Build address from separate fields if available, otherwise use address field
    if (data) {
      let fullAddress = data.address || "";
      if (data.street || data.city) {
        const addressParts = [];
        if (data.street) addressParts.push(data.street);
        if (data.city) addressParts.push(data.city);
        if (data.postal_code) addressParts.push(data.postal_code);
        if (addressParts.length > 0) {
          fullAddress = addressParts.join(", ");
        }
      }
      
      // Use company_number if registration_number is not available
      const registrationNumber = data.registration_number || data.company_number || "";
      
      companyData = {
        ...data,
        address: fullAddress,
        registration_number: registrationNumber,
      };
    } else {
      companyData = null;
    }
    
    // Get template from database
    console.log("🔵 [PreviewPage] Fetching template for company:", companyId.substring(0, 8));
    const template = await getTemplateForDocument(companyId, "receipt");
    templateHtml = template.html;
    templateCss = template.css;
    console.log("✅ [PreviewPage] Template loaded:", {
      templateId: template.templateId?.substring(0, 8) || 'fallback',
      hasHtml: !!templateHtml,
      hasCss: !!templateCss
    });
  } catch (e) {
    console.error("Failed to fetch company data or template:", e);
  }
  
  // Get receipt style settings
  const styleSettings = await getReceiptStyleSettingsPublic();
  
  // Sanitize template HTML to remove any script tags and event handlers
  let sanitizedHtml = templateHtml;
  if (sanitizedHtml) {
    console.log("🔵 [PreviewPage] Sanitizing template HTML");
    // Remove script tags and their content (case-insensitive, handles attributes)
    sanitizedHtml = sanitizedHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Remove inline event handlers (onclick, onload, etc.)
    sanitizedHtml = sanitizedHtml.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitizedHtml = sanitizedHtml.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');
    // Remove javascript: protocol in attributes
    sanitizedHtml = sanitizedHtml.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
    sanitizedHtml = sanitizedHtml.replace(/href\s*=\s*javascript:[^\s>]*/gi, 'href="#"');
    console.log("✅ [PreviewPage] Template sanitized");
  }
  
  return (
    <PreviewWrapper 
      customerData={customerData} 
      companyData={companyData} 
      styleSettings={styleSettings}
      templateHtml={sanitizedHtml}
      templateCss={templateCss}
    />
  );
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
