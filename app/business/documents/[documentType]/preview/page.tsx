import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { getReceiptStyleSettingsPublic } from "@/lib/receipt-style";
import { getTemplateForDocument } from "@/lib/pdf-service";
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets";
import PreviewWrapper from "@/app/dashboard/documents/tax-invoice/preview/PreviewWrapper";
import { getDocumentConfigByRouteSegment } from "@/lib/documents/document-configs";

async function PreviewDataLoader({
  searchParams,
  documentType,
}: {
  searchParams: any;
  documentType: string;
}) {
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

    if (documentId) {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, company_id, document_description")
        .eq("id", documentId)
        .maybeSingle();

      documentDescriptionFromDb =
        typeof (doc as any)?.document_description === "string"
          ? String((doc as any).document_description)
          : "";

      if (doc?.company_id) {
        companyId = String(doc.company_id);
      } else {
        companyId = await getCompanyIdForUser();
      }
    } else {
      companyId = await getCompanyIdForUser();
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

      const admin = createAdminClient();
      const trySignedUrl = async (path: string | null) => {
        if (!path) return null;
        const bucket = path.startsWith("business-signatures/") ? SECURE_ASSETS_BUCKET : PUBLIC_ASSETS_BUCKET;
        const { data } = await admin.storage
          .from(bucket)
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) return data.signedUrl;

        // Legacy fallback: signatures may still exist in the old public bucket.
        if (bucket === SECURE_ASSETS_BUCKET) {
          const { data: legacy } = await admin.storage.from(PUBLIC_ASSETS_BUCKET).createSignedUrl(path, 3600);
          return legacy?.signedUrl || null;
        }
        return null;
      };

      const logoPath = getStoragePathFromUrl(logoUrl);
      const signaturePath = getStoragePathFromUrl(signatureUrl);
      const signedLogoUrl = await trySignedUrl(logoPath);
      const signedSignatureUrl = await trySignedUrl(signaturePath);

      if (signedLogoUrl) logoUrl = signedLogoUrl;
      if (signedSignatureUrl) signatureUrl = signedSignatureUrl;

      companyData = {
        ...companyRowRest,
        registration_number: registrationNumber,
        address: fullAddress,
        logo_url: logoUrl,
        signature_url: signatureUrl,
      };
    }

    const template = await getTemplateForDocument(companyId, documentType as any, {
      language: params.language === "en" ? "en" : "he",
      allowFallbackToHe: true,
    });
    templateHtml = template.html;
    templateCss = template.css;
  } catch (error) {
    console.error("[BusinessPreview] Error loading preview data:", error);
  }

  const styleSettings = await getReceiptStyleSettingsPublic();

  return (
    <PreviewWrapper
      customerData={customerData}
      companyData={companyData}
      styleSettings={styleSettings}
      templateHtml={templateHtml}
      templateCss={templateCss}
      documentDescriptionFromDb={documentDescriptionFromDb}
    />
  );
}

export default async function BusinessPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentType: string }>;
  searchParams: any;
}) {
  const { documentType } = await params;
  const config = getDocumentConfigByRouteSegment(documentType);

  if (!config || config.category !== "business") {
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">תצוגת תבנית אינה זמינה למסמך זה</div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div>טוען...</div>}>
      <PreviewDataLoader searchParams={searchParams} documentType={config.dbValue} />
    </Suspense>
  );
}
