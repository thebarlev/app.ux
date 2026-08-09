import CreditNoteFormClient from "./CreditNoteFormClient";
import { redirect, notFound } from "next/navigation";
import { getDraftCreditNoteForEditAction, getInitialCreditNoteCreateData } from "./actions";

// ── CREDIT NOTE BLOCKED ───────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which is
// exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore credit-note issuance,
// revert the security/credit-note-block commits.
const CREDIT_NOTE_BLOCKED: boolean = true;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    draftId?: string;
  }>;
}) {
  // CREDIT NOTE BLOCKED — first statement executed, above BOTH render paths, so it
  // covers the ?draftId= branch below and the fresh-form return at the end. Placed
  // ahead of getInitialCreditNoteCreateData() so no query runs either.
  if (CREDIT_NOTE_BLOCKED) notFound();

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
