import InvoiceReceiptFormClient from "@/app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient";
import { redirect } from "next/navigation";
import {
  getDraftInvoiceReceiptForEditAction,
  getInitialInvoiceReceiptCreateData,
} from "@/app/dashboard/documents/invoice-receipt/actions";

export default async function TaxInvoiceReceiptPage({
  searchParams,
}: {
  searchParams?: Promise<{
    draftId?: string;
  }>;
}) {
  const initial = await getInitialInvoiceReceiptCreateData();
  const params = searchParams ? await searchParams : {};
  const draftId = typeof params?.draftId === "string" ? params.draftId : undefined;

  if (draftId) {
    const res = await getDraftInvoiceReceiptForEditAction(draftId);
    if (!res.ok) redirect("/dashboard/documents/drafts");
    const d = res.draft;
    return (
      <InvoiceReceiptFormClient
        initial={initial}
        draftId={draftId}
        editData={
          {
            id: d.id,
            customerName: d.customerName,
            documentDate: d.documentDate,
            paymentDueDate: d.paymentDueDate || undefined,
            total: d.total,
            currency: d.currency,
            notes: d.notes || "",
            vatType: d.vatType as any,
            vatRate: d.vatRate ?? undefined,
            vatAmount: d.vatAmount ?? undefined,
            subtotal: d.subtotal ?? undefined,
            items: d.items || [],
            payments: d.payments || [],
            description: d.description || "",
          } as any
        }
      />
    );
  }

  return <InvoiceReceiptFormClient initial={initial} />;
}
