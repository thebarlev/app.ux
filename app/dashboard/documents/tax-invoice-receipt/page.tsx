import InvoiceReceiptFormClient from "@/app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient";
import { getInitialInvoiceReceiptCreateData } from "@/app/dashboard/documents/invoice-receipt/actions";

export default async function TaxInvoiceReceiptPage() {
  const initial = await getInitialInvoiceReceiptCreateData();
  return <InvoiceReceiptFormClient initial={initial} />;
}
