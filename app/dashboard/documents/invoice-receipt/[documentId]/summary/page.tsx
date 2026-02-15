import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import InvoiceReceiptSummaryClient from "./InvoiceReceiptSummaryClient";
import fs from "node:fs";

const AGENT_DEBUG_LOG_PATH = "/Users/uxellent/v0-system-owner-admin-panel/.cursor/debug.log";
function agentAppendLog(payload: any) {
  try {
    fs.appendFileSync(AGENT_DEBUG_LOG_PATH, JSON.stringify(payload) + "\n");
  } catch {
    // ignore
  }
}

export default async function InvoiceReceiptSummaryPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  agentAppendLog({
    location: "invoice-receipt/summary/page.tsx:entry",
    message: "Summary page reached",
    data: { documentId },
    timestamp: Date.now(),
    hypothesisId: "H_SUMMARY_ENTRY",
  });
  const supabase = await createClient();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select(
      "id, document_number, document_type, issue_date, created_at, customer_name, customer_id, company_id, document_description, subtotal, vat_rate, vat_amount, total_amount, currency, document_status, internal_notes, customer_notes, language, allocation_number"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (documentError || !document) {
    agentAppendLog({
      location: "invoice-receipt/summary/page.tsx:docLookupFailed",
      message: "InvoiceReceipt summary doc lookup failed (RLS?)",
      data: {
        documentId,
        code: (documentError as any)?.code ?? null,
        message: documentError?.message ?? null,
      },
      timestamp: Date.now(),
      hypothesisId: "H_SUMMARY_RLS",
    });
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">{documentError?.message || "המסמך לא נמצא"}</div>
        </div>
      </div>
    );
  }

  agentAppendLog({
    location: "invoice-receipt/summary/page.tsx:docLookupOk",
    message: "InvoiceReceipt summary doc lookup ok",
    data: { documentId, document_type: (document as any)?.document_type, company_id: (document as any)?.company_id },
    timestamp: Date.now(),
    hypothesisId: "H_SUMMARY_TYPE",
  });

  const dt = String((document as any)?.document_type || "");
  const isInvoiceReceipt = dt === "invoiceReceipt" || dt === "invoice_receipt";
  if (!isInvoiceReceipt) {
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">תצוגת סיכום נתמכת כרגע לחשבוניות מס / קבלה בלבד</div>
        </div>
      </div>
    );
  }

  const companyId = (document as any).company_id as string | null;
  const customerId = (document as any).customer_id as string | null;

  const [companyRes, customerRes, itemsRes] = await Promise.all([
    companyId
      ? supabase
          .from("companies")
          .select("company_name, registration_number, company_number, email")
          .eq("id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null as any, error: null as any }),
    customerId
      ? supabase
          .from("customers")
          .select("name, tax_id, phone, mobile")
          .eq("id", customerId)
          .maybeSingle()
      : Promise.resolve({ data: null as any, error: null as any }),
    supabase
      .from("document_line_items")
      .select("description, line_total, unit_price, quantity, currency, payment_metadata")
      .eq("document_id", documentId)
      .order("line_number", { ascending: true }),
  ]);

  const company = companyRes.data || null;
  let customer = customerRes.data || null;

  // Billing invoice-receipt fallback:
  // When customer_id is null, resolve payer details from billing_documents.buyer_company_id.
  if (!customer) {
    try {
      const admin = createServiceRoleClient();
      const { data: bd, error: bdErr } = await admin
        .from("billing_documents")
        .select("buyer_company_id")
        .eq("document_id", documentId)
        .maybeSingle();
      const buyerCompanyId = String((bd as any)?.buyer_company_id || "").trim();
      if (buyerCompanyId) {
        const { data: buyerCompany, error: buyerErr } = await admin
          .from("companies")
          .select("company_name, registration_number, company_number, phone, mobile_phone, email, website, address, street, city, postal_code")
          .eq("id", buyerCompanyId)
          .maybeSingle();
        if (buyerCompany) {
          const addressParts = [
            String((buyerCompany as any)?.street || "").trim(),
            String((buyerCompany as any)?.city || "").trim(),
            String((buyerCompany as any)?.postal_code || "").trim(),
          ].filter(Boolean);
          const resolvedAddress =
            addressParts.length > 0
              ? addressParts.join(", ")
              : String((buyerCompany as any)?.address || "").trim() || null;
          customer = {
            name: String((buyerCompany as any)?.company_name || "").trim() || null,
            tax_id:
              String(
                (buyerCompany as any)?.registration_number || (buyerCompany as any)?.company_number || ""
              ).trim() || null,
            phone: String((buyerCompany as any)?.phone || "").trim() || null,
            mobile: String((buyerCompany as any)?.mobile_phone || "").trim() || null,
            email: String((buyerCompany as any)?.email || "").trim() || null,
            website: String((buyerCompany as any)?.website || "").trim() || null,
            address: resolvedAddress,
          } as any;
        }
        agentAppendLog({
          location: "invoice-receipt/summary/page.tsx:buyerFallbackLookup",
          message: "Buyer fallback lookup via service-role",
          data: {
            documentId,
            hasBillingDocument: !!bd,
            hasBuyerCompanyId: !!buyerCompanyId,
            hasBuyerCompany: !!buyerCompany,
            bdErrCode: (bdErr as any)?.code ?? null,
            buyerErrCode: (buyerErr as any)?.code ?? null,
          },
          timestamp: Date.now(),
          hypothesisId: "H_SUMMARY_CUSTOMER_FALLBACK",
        });
      } else {
        agentAppendLog({
          location: "invoice-receipt/summary/page.tsx:buyerFallbackLookup",
          message: "No buyer_company_id on billing_documents",
          data: {
            documentId,
            hasBillingDocument: !!bd,
            hasBuyerCompanyId: false,
            bdErrCode: (bdErr as any)?.code ?? null,
          },
          timestamp: Date.now(),
          hypothesisId: "H_SUMMARY_CUSTOMER_FALLBACK",
        });
      }
    } catch {
      // keep customer as null
    }
  }
  agentAppendLog({
    location: "invoice-receipt/summary/page.tsx:customerResolved",
    message: "Summary customer resolved (direct or buyer fallback)",
    data: {
      documentId,
      hasDirectCustomer: !!customerRes.data,
      hasResolvedCustomer: !!customer,
      hasName: !!String((customer as any)?.name || "").trim(),
      hasTaxId: !!String((customer as any)?.tax_id || "").trim(),
      hasPhone: !!String((customer as any)?.mobile || (customer as any)?.phone || "").trim(),
      hasAddress: !!String((customer as any)?.address || "").trim(),
      hasEmail: !!String((customer as any)?.email || "").trim(),
      hasWebsite: !!String((customer as any)?.website || "").trim(),
    },
    timestamp: Date.now(),
    hypothesisId: "H_SUMMARY_CUSTOMER_FALLBACK",
  });
  const itemsRawAll = itemsRes.data || [];
  // Filter out payment-only rows when issuer uses kind discriminator (subscription billing issuance)
  const itemsRaw = (itemsRawAll as any[]).filter((item) => {
    const kind = (item?.payment_metadata as any)?.kind
    return kind === "payment" ? false : true
  });

  const items = (itemsRaw as any[]).map((item) => {
    const meta = item?.payment_metadata || {};
    return {
      label: typeof meta?.label === "string" ? meta.label : item?.description ?? null,
      sku: typeof meta?.sku === "string" ? meta.sku : null,
      description: typeof meta?.details === "string" ? meta.details : item?.description ?? null,
      quantity: typeof item?.quantity === "number" ? item.quantity : null,
      unitPrice: typeof item?.unit_price === "number" ? item.unit_price : null,
      lineTotal: typeof item?.line_total === "number" ? item.line_total : typeof item?.unit_price === "number" ? item.unit_price : null,
      currency: item?.currency ?? null,
      vatMode: typeof meta?.vatMode === "string" ? meta.vatMode : null,
    };
  });

  return (
    <InvoiceReceiptSummaryClient
      invoiceReceipt={document as any}
      company={company as any}
      customer={customer as any}
      items={items as any}
    />
  );
}
