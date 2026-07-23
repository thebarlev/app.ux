import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import DocumentView, { type DocumentViewSnapshot } from "@/components/documents/DocumentView";

/**
 * Document page — replaces the floating quick-view drawer that used to open from
 * the documents list. Real content (line items, linked documents) belongs at a
 * URL: back works, and the view can be refreshed and shared.
 *
 * Note on routing: this dynamic segment sits alongside static siblings
 * (all, drafts, income, ongoing, new, receipt, tax-invoice, ...). Next.js matches
 * static segments first, so those keep working; only an unmatched segment such as
 * a document id reaches here.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let companyId: string;
  try {
    companyId = await getCompanyIdForUser();
  } catch {
    redirect("/register");
  }

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, document_number, document_type, issue_date, customer_id, customer_name, document_description, total_amount, currency, document_status, accounting_status, outstanding_balance, reference_text, created_at"
    )
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  // `payment_method` is not a column — the list derives it from the first line
  // item's description (app/dashboard/documents/actions.ts), so do the same here.
  const { data: firstLine } = await supabase
    .from("document_line_items")
    .select("description")
    .eq("document_id", id)
    .order("line_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  const d = data as any;
  const doc: DocumentViewSnapshot = {
    id: String(d.id),
    document_number: d.document_number ?? null,
    document_type: String(d.document_type || ""),
    // The list computes document_date as issue_date || created_at; match it.
    document_date: d.issue_date || d.created_at || null,
    customer_id: d.customer_id ?? null,
    customer_name: d.customer_name ?? null,
    document_description: d.document_description ?? null,
    payment_method: (firstLine as any)?.description ?? null,
    total_amount:
      typeof d.total_amount === "number" ? d.total_amount : d.total_amount != null ? Number(d.total_amount) : null,
    currency: d.currency ?? null,
    document_status: String(d.document_status || ""),
    accounting_status: d.accounting_status ?? null,
    outstanding_balance:
      typeof d.outstanding_balance === "number"
        ? d.outstanding_balance
        : d.outstanding_balance != null
          ? Number(d.outstanding_balance)
          : null,
    reference_text: d.reference_text ?? null,
    created_at: String(d.created_at || ""),
  };

  return <DocumentView documentId={id} doc={doc} />;
}
