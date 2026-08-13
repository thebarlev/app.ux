import { notFound } from "next/navigation"
import ReceiptFormClient from "@/app/dashboard/documents/receipt/ReceiptFormClient"
import { getInitialReceiptCreateData } from "@/app/dashboard/documents/receipt/actions"
import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient"
import { getInitialTaxInvoiceCreateData } from "@/app/dashboard/documents/tax-invoice/actions"
import InvoiceReceiptFormClient from "@/app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient"
import { getInitialInvoiceReceiptCreateData } from "@/app/dashboard/documents/invoice-receipt/actions"
import CreditNoteFormClient from "@/app/dashboard/documents/credit-note/CreditNoteFormClient"
import { getInitialCreditNoteCreateData } from "@/app/dashboard/documents/credit-note/actions"

/*
 * ⛔ The credit-note route opens again, because the block became a precondition.
 *
 * It 404'd so that a click could not create a locked credit sequence with a starting number no
 * accountant chose. That case is now refused where the number is actually drawn — in
 * issueCreditNoteAction, via lib/documents/credit-note-precondition.ts — which no UI can
 * bypass. Hiding the form as well would only mean a person meets a 404 instead of a sentence
 * telling them what is missing and who decides it.
 */

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
    // CREDIT NOTE BLOCKED — first statement in this branch, so the direct URL
    // /dashboard/incomes/documents/new/creditNote 404s too, not just the tile.
    // The allocation stop in issueCreditNoteAction is the real guarantee; this
    // closes the door so nobody reaches the form and gets a toast instead.

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
