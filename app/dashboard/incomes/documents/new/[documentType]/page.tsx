import { notFound } from "next/navigation"
import ReceiptFormClient from "@/app/dashboard/documents/receipt/ReceiptFormClient"
import { getInitialReceiptCreateData } from "@/app/dashboard/documents/receipt/actions"
import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient"
import { getInitialTaxInvoiceCreateData } from "@/app/dashboard/documents/tax-invoice/actions"
import InvoiceReceiptFormClient from "@/app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient"
import { getInitialInvoiceReceiptCreateData } from "@/app/dashboard/documents/invoice-receipt/actions"
import CreditNoteFormClient from "@/app/dashboard/documents/credit-note/CreditNoteFormClient"
import { getInitialCreditNoteCreateData } from "@/app/dashboard/documents/credit-note/actions"

type Params = {
  documentType: "invoice" | "invoiceReceipt" | "receipt" | "creditNote"
}

export default async function IncomeDocumentNewPage({ params }: { params: Params }) {
  const { documentType } = params || ({} as Params)

  if (documentType === "receipt") {
    const initial = await getInitialReceiptCreateData()
    return <ReceiptFormClient initial={initial} />
  }

  if (documentType === "invoice") {
    const initial = await getInitialTaxInvoiceCreateData()
    return <TaxInvoiceFormClient initial={initial} />
  }

  if (documentType === "invoiceReceipt") {
    const initial = await getInitialInvoiceReceiptCreateData()
    return <InvoiceReceiptFormClient initial={initial} />
  }

  if (documentType === "creditNote") {
    const initial = await getInitialCreditNoteCreateData()
    return <CreditNoteFormClient initial={initial} />
  }

  notFound()
}

export async function generateStaticParams() {
  return [
    { documentType: "invoice" },
    { documentType: "invoiceReceipt" },
    { documentType: "receipt" },
    { documentType: "creditNote" },
  ]
}
