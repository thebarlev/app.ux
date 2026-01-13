import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      .select("company_name, company_name_en, contact_first_name, contact_first_name_en, business_type, registration_number, company_number, address, street, city, postal_code, phone, mobile_phone, email, website, logo_url, signature_url")
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
      
      // Create signed URLs for logo and signature if they exist and are from private storage
      let logoUrl = data.logo_url || null;
      let signatureUrl = data.signature_url || null;
      
      // Helper to extract storage path from URL
      const getStoragePathFromUrl = (url: string | null | undefined): string | null => {
        if (!url) return null;
        // If URL contains storage path, extract it
        const storageMatch = url.match(/business-(logos|signatures)\/[^/]+\/[^/]+/);
        if (storageMatch) {
          return storageMatch[0];
        }
        // If it's already a storage path (relative)
        if (url.startsWith('business-logos/') || url.startsWith('business-signatures/')) {
          return url;
        }
        // If it's a full URL, try to extract path after /business-assets/
        const assetsMatch = url.match(/business-assets\/(.+)$/);
        if (assetsMatch) {
          return assetsMatch[1];
        }
        return null;
      };
      
      // Process logo URL - create signed URL if from private storage
      if (data.logo_url) {
        const storagePath = getStoragePathFromUrl(data.logo_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from("business-assets")
              .createSignedUrl(storagePath, 3600); // 1 hour expiry
            
            if (!signedUrlError && signedUrlData?.signedUrl) {
              logoUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for logo: ${storagePath}`);
            } else {
              // If signed URL fails, try public URL (bucket might be public)
              const { data: publicUrlData } = adminClient.storage
                .from("business-assets")
                .getPublicUrl(storagePath);
              logoUrl = publicUrlData.publicUrl || data.logo_url;
              console.log(`[PreviewPage] Using public URL for logo: ${publicUrlData.publicUrl || data.logo_url}`);
            }
          } catch (error) {
            // Fallback to original URL
            logoUrl = data.logo_url;
            console.warn(`[PreviewPage] Failed to create signed URL for logo, using original:`, error);
          }
        } else {
          // If we can't extract storage path, use original URL (might be external URL)
          logoUrl = data.logo_url;
        }
      }
      
      // Process signature URL - create signed URL if from private storage
      if (data.signature_url) {
        const storagePath = getStoragePathFromUrl(data.signature_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from("business-assets")
              .createSignedUrl(storagePath, 3600); // 1 hour expiry
            
            if (!signedUrlError && signedUrlData?.signedUrl) {
              signatureUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for signature: ${storagePath}`);
            } else {
              // If signed URL fails, try public URL (bucket might be public)
              const { data: publicUrlData } = adminClient.storage
                .from("business-assets")
                .getPublicUrl(storagePath);
              signatureUrl = publicUrlData.publicUrl || data.signature_url;
              console.log(`[PreviewPage] Using public URL for signature: ${publicUrlData.publicUrl || data.signature_url}`);
            }
          } catch (error) {
            // Fallback to original URL
            signatureUrl = data.signature_url;
            console.warn(`[PreviewPage] Failed to create signed URL for signature, using original:`, error);
          }
        } else {
          // If we can't extract storage path, use original URL (might be external URL)
          signatureUrl = data.signature_url;
        }
      }
      
      companyData = {
        ...data,
        address: fullAddress,
        registration_number: registrationNumber,
        logo_url: logoUrl,
        signature_url: signatureUrl,
      };
    } else {
      companyData = null;
    }
    
    // Get template from database
    console.log("🔵 [PreviewPage] Fetching template for company:", companyId.substring(0, 8));
    const template = await getTemplateForDocument(companyId, "receipt");
    
    if (!template.html) {
      console.error("[PreviewPage] Template HTML is missing!", {
        templateId: template.templateId,
        companyId: companyId.substring(0, 8),
        resolvedLanguage: template.resolvedLanguage
      });
    } else {
      console.log("[PreviewPage] Template HTML loaded:", {
        templateId: template.templateId?.substring(0, 8) || 'fallback',
        htmlLength: template.html.length,
        resolvedLanguage: template.resolvedLanguage
      });
    }
    
    if (!template.css) {
      console.warn("[PreviewPage] Template CSS is missing, using empty string");
    } else {
      console.log("[PreviewPage] Template CSS loaded:", {
        cssLength: template.css.length
      });
    }
    
    templateHtml = template.html || null;
    templateCss = template.css || "";
    
    console.log("✅ [PreviewPage] Template loaded:", {
      templateId: template.templateId?.substring(0, 8) || 'fallback',
      hasHtml: !!templateHtml,
      htmlLength: templateHtml?.length || 0,
      hasCss: !!templateCss,
      cssLength: templateCss?.length || 0
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
