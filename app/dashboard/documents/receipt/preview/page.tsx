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

  // Use the same company resolution as PDF when documentId is available:
  // companyId must come from documents.company_id (source of truth).
  const documentId: string | null =
    params.documentId || params.document_id || params.id || null;

  // #region agent log (hypothesisId=PV0)
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany2',hypothesisId:'PV0',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Preview searchParams documentId detection',data:{hasDocumentId:Boolean(documentId),documentIdSuffix:documentId?String(documentId).slice(-6):null,has_documentId:Boolean(params?.documentId),has_document_id:Boolean(params?.document_id),has_id:Boolean(params?.id)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // #region agent log (hypothesisId=PV0)
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany2',hypothesisId:'PV0',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Preview searchParams keys (names only)',data:{keys:Object.keys(params||{}).sort(),hasPreviewNumber:Boolean(params?.previewNumber),hasCustomerId:Boolean(params?.customerId),hasPayments:Boolean(params?.payments)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  
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

      // #region agent log (hypothesisId=PV1)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany1',hypothesisId:'PV1',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Resolved company via documents.company_id',data:{hasDocumentId:true,documentIdSuffix:String(documentId).slice(-6),hasDoc:Boolean(doc),docErrorCode:(docError as any)?.code??null,hasCompanyId:Boolean(doc?.company_id),companyIdSuffix:doc?.company_id?String(doc.company_id).slice(-6):null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

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

    // #region agent log (hypothesisId=PV2)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany1',hypothesisId:'PV2',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Preview will fetch company/template using companyId',data:{companyIdSource,companyIdSuffix:String(companyId).slice(-6),hasDocumentId:Boolean(documentId)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
    
    // #region agent log (hypothesisId=PV8)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany5',hypothesisId:'PV8',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Companies fetch result (counts only)',data:{companyIdSuffix:String(companyId).slice(-6),hasCompanyRow:Boolean(companyRow),companyFetchErrorCode:(companyFetchError as any)?.code??null,companyFetchErrorMessage:companyFetchError?.message??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
              signatureUrl = publicUrlData.publicUrl || companyRow.signature_url;
              console.log(`[PreviewPage] Using public URL for signature: ${publicUrlData.publicUrl || companyRow.signature_url}`);
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

      // #region agent log (hypothesisId=PV4)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany3',hypothesisId:'PV4',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'CompanyData normalized for Preview (truthy/lengths)',data:{companyIdSource,companyIdSuffix:String(companyId).slice(-6),hasLogoUrl:Boolean(logoUrl&&String(logoUrl).trim()),hasSignatureUrl:Boolean(signatureUrl&&String(signatureUrl).trim()),regLen:String(registrationNumber||'').length,streetLen:String(companyRow.street||'').length,cityLen:String(companyRow.city||'').length,postalLen:String(companyRow.postal_code||'').length,emailLen:String(companyRow.email||'').length,websiteLen:String(companyRow.website||'').length,mobileLen:String(companyRow.mobile_phone||'').length,phoneLen:String(companyRow.phone||'').length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
    
    // #region agent log (hypothesisId=PV6)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany4',hypothesisId:'PV6',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Template fetched (lengths only)',data:{hasHtml:Boolean(templateHtml&&String(templateHtml).trim()),htmlLen:typeof templateHtml==='string'?templateHtml.length:0,cssLen:typeof templateCss==='string'?templateCss.length:0,companyIdSuffix:typeof companyId==='string'?String(companyId).slice(-6):null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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

    // #region agent log (hypothesisId=PV6)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'previewCompany4',hypothesisId:'PV6',location:'app/dashboard/documents/receipt/preview/page.tsx:PreviewDataLoader',message:'Template sanitized (length delta only)',data:{beforeLen,afterLen:sanitizedHtml.length,trimmedLen:sanitizedHtml.trim().length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
