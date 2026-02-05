import TaxInvoiceFormClient from "./TaxInvoiceFormClient";
import { redirect } from "next/navigation";
import { getDraftTaxInvoiceForEditAction, getInitialTaxInvoiceCreateData } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    draftId?: string;
  }>;
}) {
  const initial = await getInitialTaxInvoiceCreateData();
  const params = searchParams ? await searchParams : {};
  const draftId = typeof params?.draftId === "string" ? params.draftId : undefined;

  if (draftId) {
    const res = await getDraftTaxInvoiceForEditAction(draftId);
    if (!res.ok) redirect("/dashboard/documents/drafts");
    const d = res.draft;
    return (
      <TaxInvoiceFormClient
        initial={initial}
        documentType="tax_invoice"
        draftId={draftId}
        editData={{
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
          // extra fields are ignored by the client prop typing
        } as any}
      />
    );
  }

  return <TaxInvoiceFormClient initial={initial} />;
}
