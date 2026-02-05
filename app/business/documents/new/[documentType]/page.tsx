import { notFound } from "next/navigation";
import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient";
import { redirect } from "next/navigation";
import { getDraftDocumentForEditAction, getInitialDocumentCreateData } from "@/lib/documents/actions";
import type { DocumentIssueType } from "@/lib/documents/types";
import { getDocumentConfig } from "@/lib/documents/document-configs";

export default async function BusinessDocumentNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentType: string }>;
  searchParams?: Promise<{ draftId?: string }>;
}) {
  const { documentType } = await params;
  const config = getDocumentConfig(documentType);

  if (!config || config.category !== "business") {
    notFound();
  }

  const initial = await getInitialDocumentCreateData(documentType as DocumentIssueType);

  const sp = searchParams ? await searchParams : {};
  const draftId = typeof sp?.draftId === "string" ? sp.draftId : undefined;
  if (draftId) {
    const res = await getDraftDocumentForEditAction(documentType as DocumentIssueType, draftId);
    if (!res.ok) redirect("/dashboard/documents/drafts");
    const d = res.draft;
    return (
      <TaxInvoiceFormClient
        initial={initial}
        documentType={documentType as DocumentIssueType}
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

  return <TaxInvoiceFormClient initial={initial} documentType={documentType as DocumentIssueType} />;
}

export async function generateStaticParams() {
  return [
    { documentType: "quote" },
    { documentType: "proforma" },
    { documentType: "workOrder" },
    { documentType: "deliveryNote" },
    { documentType: "returnNote" },
    { documentType: "purchaseOrder" },
    { documentType: "selfInvoice" },
    { documentType: "selfCreditNote" },
  ];
}
