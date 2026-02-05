import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { getReceiptStyleSettingsPublic } from "@/lib/receipt-style";
import { getTemplateForDocument } from "@/lib/pdf-service";
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets";
import PreviewWrapper from "./PreviewWrapper";

async function PreviewDataLoader({ searchParams }: { searchParams: any }) {
  const supabase = await createClient();
  
  // Await searchParams in Next.js 16
  const params = await searchParams;

  // Use the same company resolution as PDF when documentId is available:
  // companyId must come from documents.company_id (source of truth).
  const documentId: string | null =
    params.documentId || params.document_id || params.id || null;

  
  
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
  let documentDescriptionFromDb: string = "";
  
  try {
    let companyId: string;
    let companyIdSource: "document.company_id" | "getCompanyIdForUser";

    if (documentId) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, company_id, document_description")
        .eq("id", documentId)
        .maybeSingle();

      documentDescriptionFromDb =
        typeof (doc as any)?.document_description === "string"
          ? String((doc as any).document_description)
          : "";

      if (!docError && doc?.company_id) {
        companyId = String(doc.company_id);
        companyIdSource = "document.company_id";
      } else {
        // Fall back to previous behavior if document lookup fails (e.g., draft preview without persisted doc).
        companyId = await getCompanyIdForUser();
        companyIdSource = "getCompanyIdForUser";
      }
    } else {
      companyId = await getCompanyIdForUser();
      companyIdSource = "getCompanyIdForUser";
    }

    // Some environments may not have optional EN columns (company_name_en, contact_first_name_en).
    // Try with EN columns first, then retry without on 42703.
    const selectWithEnglish =
      "id, company_name, company_name_en, contact_first_name, contact_first_name_en, business_type, registration_number, company_number, address, street, city, postal_code, phone, mobile_phone, email, website, logo_url, signature_url";
    const selectWithoutEnglish =
      "id, company_name, contact_first_name, business_type, registration_number, company_number, address, street, city, postal_code, phone, mobile_phone, email, website, logo_url, signature_url";

    let companyRow: any = null;
    let companyFetchError: any = null;

    const r1 = await supabase
      .from("companies")
      .select(selectWithEnglish)
      .eq("id", companyId)
      .maybeSingle();
    companyRow = r1.data;
    companyFetchError = r1.error;

    const code = String((companyFetchError as any)?.code || "");
    const msg = String((companyFetchError as any)?.message || "");
    const missingEnglishCols = msg.includes("company_name_en") || msg.includes("contact_first_name_en");
    if (companyFetchError && code === "42703" && missingEnglishCols) {
      const r2 = await supabase
        .from("companies")
        .select(selectWithoutEnglish)
        .eq("id", companyId)
        .maybeSingle();
      companyRow = r2.data;
      companyFetchError = r2.error;
    }
    
    // Build address from separate fields if available, otherwise use address field
    if (companyRow) {
      // Avoid passing unknown keys to PreviewClient CompanyData shape (keep it strict)
      const { id: _ignoreId, ...companyRowRest } = companyRow as any;
      let fullAddress = companyRow.address || "";
      if (companyRow.street || companyRow.city) {
        const addressParts = [];
        if (companyRow.street) addressParts.push(companyRow.street);
        if (companyRow.city) addressParts.push(companyRow.city);
        if (companyRow.postal_code) addressParts.push(companyRow.postal_code);
        if (addressParts.length > 0) {
          fullAddress = addressParts.join(", ");
        }
      }
      
      // Use company_number if registration_number is not available
      const registrationNumber = companyRow.registration_number || companyRow.company_number || "";
      
      // Create signed URLs for logo and signature if they exist and are from private storage
      let logoUrl = companyRow.logo_url || null;
      let signatureUrl = companyRow.signature_url || null;
      
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
      if (companyRow.logo_url) {
        const storagePath = getStoragePathFromUrl(companyRow.logo_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from(PUBLIC_ASSETS_BUCKET)
              .createSignedUrl(storagePath, 3600); // 1 hour expiry
            
            if (!signedUrlError && signedUrlData?.signedUrl) {
              logoUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for logo: ${storagePath}`);
            } else {
              // If signed URL fails, try public URL (bucket might be public)
              const { data: publicUrlData } = adminClient.storage
                .from(PUBLIC_ASSETS_BUCKET)
                .getPublicUrl(storagePath);
              logoUrl = publicUrlData.publicUrl || companyRow.logo_url;
              console.log(`[PreviewPage] Using public URL for logo: ${publicUrlData.publicUrl || companyRow.logo_url}`);
            }
          } catch (error) {
            // Fallback to original URL
            logoUrl = companyRow.logo_url;
            console.warn(`[PreviewPage] Failed to create signed URL for logo, using original:`, error);
          }
        } else {
          // If we can't extract storage path, use original URL (might be external URL)
          logoUrl = companyRow.logo_url;
        }
      }
      
      // Process signature URL - create signed URL if from private storage
      if (companyRow.signature_url) {
        const storagePath = getStoragePathFromUrl(companyRow.signature_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from(SECURE_ASSETS_BUCKET)
              .createSignedUrl(storagePath, 3600); // 1 hour expiry
            
            if (!signedUrlError && signedUrlData?.signedUrl) {
              signatureUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for signature: ${storagePath}`);
            } else {
              // Legacy fallback: signature may still exist in the old public bucket.
              const { data: legacySigned } = await adminClient.storage
                .from(PUBLIC_ASSETS_BUCKET)
                .createSignedUrl(storagePath, 3600);
              signatureUrl = legacySigned?.signedUrl || companyRow.signature_url;
            }
          } catch (error) {
            // Fallback to original URL
            signatureUrl = companyRow.signature_url;
            console.warn(`[PreviewPage] Failed to create signed URL for signature, using original:`, error);
          }
        } else {
          // If we can't extract storage path, use original URL (might be external URL)
          signatureUrl = companyRow.signature_url;
        }
      }
      
      // Normalize shape for PreviewClient: ensure required fields exist on companyData
      companyData = {
        ...companyRowRest,
        company_name: companyRow.company_name || "",
        company_name_en: companyRow.company_name_en || "",
        // Ensure registration_number is always set (fallback to company_number)
        registration_number: registrationNumber,
        company_number: companyRow.company_number || "",
        // Ensure contact fields exist (may be used by templates)
        contact_first_name: (companyRow as any).contact_first_name || "",
        contact_first_name_en: (companyRow as any).contact_first_name_en || "",
        // Ensure address parts are preserved and address is the joined string
        street: companyRow.street || "",
        city: companyRow.city || "",
        postal_code: companyRow.postal_code || "",
        address: fullAddress || "",
        // Ensure comms fields exist
        phone: companyRow.phone || "",
        mobile_phone: companyRow.mobile_phone || "",
        email: companyRow.email || "",
        website: companyRow.website || "",
        // Signed URLs (or original URLs) for assets
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
    const beforeLen = sanitizedHtml.length;
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
      documentDescriptionFromDb={documentDescriptionFromDb}
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
