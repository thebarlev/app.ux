import { createClient } from "@/lib/supabase/server";
import ReceiptSummaryClient from "./ReceiptSummaryClient";

export default async function ReceiptSummaryPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createClient();

  const { data: receipt, error: receiptError } = await supabase
    .from("documents")
    .select(
      "id, document_number, document_type, issue_date, created_at, customer_name, customer_id, company_id, document_description, total_amount, currency, document_status, internal_notes, customer_notes"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (receiptError || !receipt) {
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">{receiptError?.message || "המסמך לא נמצא"}</div>
        </div>
      </div>
    );
  }

  if (receipt.document_type !== "receipt") {
    return (
      <div className="ui-container pt-10">
        <div className="ui-alert-danger">
          <div className="font-bold">שגיאה</div>
          <div className="mt-2">תצוגת סיכום נתמכת כרגע לקבלות בלבד</div>
        </div>
      </div>
    );
  }

  const companyId = (receipt as any).company_id as string | null;
  const customerId = (receipt as any).customer_id as string | null;

  const [companyRes, customerRes, paymentsRes] = await Promise.all([
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
      .select("description, item_date, line_total, unit_price, currency, payment_metadata")
      .eq("document_id", documentId)
      .order("line_number", { ascending: true }),
  ]);

  const company = companyRes.data || null;
  const customer = customerRes.data || null;
  const paymentsRaw = paymentsRes.data || [];

  const payments = (paymentsRaw as any[]).map((item) => {
    const meta = item?.payment_metadata || {};
    return {
      method: item?.description ?? null,
      details: typeof meta?.description === "string" ? meta.description : null,
      date: item?.item_date ?? null,
      amount: typeof item?.line_total === "number" ? item.line_total : typeof item?.unit_price === "number" ? item.unit_price : null,
      currency: item?.currency ?? null,
    };
  });

  return (
    <ReceiptSummaryClient
      receipt={receipt as any}
      company={company as any}
      customer={customer as any}
      payments={payments as any}
    />
  );
}

