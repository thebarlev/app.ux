import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { getReceiptStyleSettingsPublic } from "@/lib/receipt-style";
import { getTemplateForDocument } from "@/lib/pdf-service";
import PreviewWrapper from "./PreviewWrapper";

async function PreviewDataLoader({ searchParams }: { searchParams: any }) {
  const supabase = await createClient();

  const params = await searchParams;

  const documentId: string | null =
    params.documentId || params.document_id || params.id || null;

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
        companyId = await getCompanyIdForUser();
        companyIdSource = "getCompanyIdForUser";
      }
    } else {
      companyId = await getCompanyIdForUser();
      companyIdSource = "getCompanyIdForUser";
    }

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

    if (companyRow) {
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

      const registrationNumber = companyRow.registration_number || companyRow.company_number || "";

      let logoUrl = companyRow.logo_url || null;
      let signatureUrl = companyRow.signature_url || null;

      const getStoragePathFromUrl = (url: string | null | undefined): string | null => {
        if (!url) return null;
        const storageMatch = url.match(/business-(logos|signatures)\/[^/]+\/[^/]+/);
        if (storageMatch) {
          return storageMatch[0];
        }
        if (url.startsWith("business-logos/") || url.startsWith("business-signatures/")) {
          return url;
        }
        const assetsMatch = url.match(/business-assets\/(.+)$/);
        if (assetsMatch) {
          return assetsMatch[1];
        }
        return null;
      };

      if (companyRow.logo_url) {
        const storagePath = getStoragePathFromUrl(companyRow.logo_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from("business-assets")
              .createSignedUrl(storagePath, 3600);

            if (!signedUrlError && signedUrlData?.signedUrl) {
              logoUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for logo: ${storagePath}`);
            } else {
              const { data: publicUrlData } = adminClient.storage
                .from("business-assets")
                .getPublicUrl(storagePath);
              logoUrl = publicUrlData.publicUrl || companyRow.logo_url;
              console.log(`[PreviewPage] Using public URL for logo: ${publicUrlData.publicUrl || companyRow.logo_url}`);
            }
          } catch (error) {
            logoUrl = companyRow.logo_url;
            console.warn(`[PreviewPage] Failed to create signed URL for logo, using original:`, error);
          }
        } else {
          logoUrl = companyRow.logo_url;
        }
      }

      if (companyRow.signature_url) {
        const storagePath = getStoragePathFromUrl(companyRow.signature_url);
        if (storagePath) {
          try {
            const adminClient = createAdminClient();
            const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
              .from("business-assets")
              .createSignedUrl(storagePath, 3600);

            if (!signedUrlError && signedUrlData?.signedUrl) {
              signatureUrl = signedUrlData.signedUrl;
              console.log(`[PreviewPage] Created signed URL for signature: ${storagePath}`);
            } else {
              const { data: publicUrlData } = adminClient.storage
                .from("business-assets")
                .getPublicUrl(storagePath);
              signatureUrl = publicUrlData.publicUrl || companyRow.signature_url;
              console.log(`[PreviewPage] Using public URL for signature: ${publicUrlData.publicUrl || companyRow.signature_url}`);
            }
          } catch (error) {
            signatureUrl = companyRow.signature_url;
            console.warn(`[PreviewPage] Failed to create signed URL for signature, using original:`, error);
          }
        } else {
          signatureUrl = companyRow.signature_url;
        }
      }

      companyData = {
        ...companyRowRest,
        company_name: companyRow.company_name || "",
        company_name_en: companyRow.company_name_en || "",
        registration_number: registrationNumber,
        company_number: companyRow.company_number || "",
        contact_first_name: (companyRow as any).contact_first_name || "",
        contact_first_name_en: (companyRow as any).contact_first_name_en || "",
        street: companyRow.street || "",
        city: companyRow.city || "",
        postal_code: companyRow.postal_code || "",
        address: fullAddress || "",
        phone: companyRow.phone || "",
        mobile_phone: companyRow.mobile_phone || "",
        email: companyRow.email || "",
        website: companyRow.website || "",
        logo_url: logoUrl,
        signature_url: signatureUrl,
      };
    } else {
      companyData = null;
    }

    console.log("🔵 [PreviewPage] Fetching template for company:", companyId.substring(0, 8));
    const template = await getTemplateForDocument(companyId, "tax_invoice");

    if (!template.html) {
      console.error("[PreviewPage] Template HTML is missing!", {
        templateId: template.templateId,
        companyId: companyId.substring(0, 8),
        resolvedLanguage: template.resolvedLanguage,
      });
    } else {
      console.log("[PreviewPage] Template HTML loaded:", {
        templateId: template.templateId?.substring(0, 8) || "fallback",
        htmlLength: template.html.length,
        resolvedLanguage: template.resolvedLanguage,
      });
    }

    if (!template.css) {
      console.warn("[PreviewPage] Template CSS is missing, using empty string");
    } else {
      console.log("[PreviewPage] Template CSS loaded:", {
        cssLength: template.css.length,
      });
    }

    templateHtml = template.html || null;
    templateCss = template.css || "";

    console.log("✅ [PreviewPage] Template loaded:", {
      templateId: template.templateId?.substring(0, 8) || "fallback",
      hasHtml: !!templateHtml,
      htmlLength: templateHtml?.length || 0,
      hasCss: !!templateCss,
      cssLength: templateCss?.length || 0,
    });
  } catch (e) {
    console.error("Failed to fetch company data or template:", e);
  }

  const styleSettings = await getReceiptStyleSettingsPublic();

  let sanitizedHtml = templateHtml;
  if (sanitizedHtml) {
    console.log("🔵 [PreviewPage] Sanitizing template HTML");
    sanitizedHtml = sanitizedHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    sanitizedHtml = sanitizedHtml.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
    sanitizedHtml = sanitizedHtml.replace(/\son\w+\s*=\s*[^\s>]*/gi, "");
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

export default async function TaxInvoicePreviewPage({ searchParams }: { searchParams: any }) {
  const params = await searchParams;

  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>טוען...</div>}>
      <PreviewDataLoader searchParams={params} />
    </Suspense>
  );
}
