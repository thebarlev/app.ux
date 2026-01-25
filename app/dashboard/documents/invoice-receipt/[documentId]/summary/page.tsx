import { createClient } from "@/lib/supabase/server";
import InvoiceReceiptSummaryClient from "./InvoiceReceiptSummaryClient";

export default async function InvoiceReceiptSummaryPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createClient();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select(
      "id, document_number, document_type, issue_date, created_at, customer_name, customer_id, company_id, document_description, subtotal, vat_rate, vat_amount, total_amount, currency, document_status, internal_notes, customer_notes, language"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (documentError || !document) {
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">{documentError?.message || "המסמך לא נמצא"}</div>
        </div>
      </div>
    );
  }

  if (document.document_type !== "invoiceReceipt") {
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
  const customer = customerRes.data || null;
  const itemsRaw = itemsRes.data || [];

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
