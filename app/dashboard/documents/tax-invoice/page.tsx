import TaxInvoiceFormClient from "./TaxInvoiceFormClient";
import { getInitialTaxInvoiceCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialTaxInvoiceCreateData();

  return <TaxInvoiceFormClient initial={initial} />;
}
