import CreditNoteFormClient from "./CreditNoteFormClient";
import { redirect, notFound } from "next/navigation";
import { getDraftCreditNoteForEditAction, getInitialCreditNoteCreateData } from "./actions";

/*
 * ⛔ The route no longer 404s, and that is the point of the change.
 *
 * The block hid the form so a click could not create a locked credit sequence with a starting
 * number no accountant chose. The precondition in
 * lib/documents/credit-note-precondition.ts refuses that exact case at issuance instead, so the
 * form can open: a person can fill it, save a draft, and see plainly what is missing and who
 * decides it, rather than meeting a 404 that explains nothing.
 *
 * Issuance itself is still refused until the starting number exists — by the action, which is
 * where the number is actually drawn, and which no UI can bypass.
 */

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
