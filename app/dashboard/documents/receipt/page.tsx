import ReceiptFormClient from "./ReceiptFormClient";
import { redirect } from "next/navigation";
import { getDraftReceiptForEditAction, getInitialReceiptCreateData } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    draftId?: string;
  }>;
}) {
  const initial = await getInitialReceiptCreateData();
  const params = searchParams ? await searchParams : {};
  const draftId = typeof params?.draftId === "string" ? params.draftId : undefined;

  if (draftId) {
    const res = await getDraftReceiptForEditAction(draftId);
    if (!res.ok) redirect("/dashboard/documents/drafts");
    const d = res.draft;
    return (
      <ReceiptFormClient
        initial={initial}
        draftId={draftId}
        editData={{
          id: d.id,
          customerName: d.customerName,
          documentDate: d.documentDate,
          description: d.description || "",
          total: d.total,
          currency: d.currency,
          notes: d.notes || "",
          payments: d.payments || [],
        }}
      />
    );
  }

  return <ReceiptFormClient initial={initial} />;
}
