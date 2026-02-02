import { notFound } from "next/navigation";
import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient";
import { getInitialDocumentCreateData } from "@/lib/documents/actions";
import type { DocumentIssueType } from "@/lib/documents/types";
import { getDocumentConfig } from "@/lib/documents/document-configs";

export default async function BusinessDocumentNewPage({
  params,
}: {
  params: Promise<{ documentType: string }>;
}) {
  const { documentType } = await params;
  const config = getDocumentConfig(documentType);

  if (!config || config.category !== "business") {
    notFound();
  }

  const initial = await getInitialDocumentCreateData(documentType as DocumentIssueType);

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
