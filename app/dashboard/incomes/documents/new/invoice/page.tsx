import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient"
import { getInitialTaxInvoiceCreateData } from "@/app/dashboard/documents/tax-invoice/actions"
export default async function NewIncomeTaxInvoicePage() {
  const initial = await getInitialTaxInvoiceCreateData()
  return <TaxInvoiceFormClient initial={initial} />
}
