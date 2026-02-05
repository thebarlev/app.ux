import CreditNoteFormClient from "./CreditNoteFormClient";
import { redirect } from "next/navigation";
import { getDraftCreditNoteForEditAction, getInitialCreditNoteCreateData } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    draftId?: string;
  }>;
}) {
  const initial = await getInitialCreditNoteCreateData();
  const params = searchParams ? await searchParams : {};
  const draftId = typeof params?.draftId === "string" ? params.draftId : undefined;

  if (draftId) {
    const res = await getDraftCreditNoteForEditAction(draftId);
    if (!res.ok) redirect("/dashboard/documents/drafts");
    const d = res.draft;
    return (
      <CreditNoteFormClient
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
            description: d.description || "",
          } as any
        }
      />
    );
  }

  return <CreditNoteFormClient initial={initial} />;
}
