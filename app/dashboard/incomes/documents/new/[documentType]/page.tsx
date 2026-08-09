import { notFound } from "next/navigation"
import ReceiptFormClient from "@/app/dashboard/documents/receipt/ReceiptFormClient"
import { getInitialReceiptCreateData } from "@/app/dashboard/documents/receipt/actions"
import TaxInvoiceFormClient from "@/app/dashboard/documents/tax-invoice/TaxInvoiceFormClient"
import { getInitialTaxInvoiceCreateData } from "@/app/dashboard/documents/tax-invoice/actions"
import InvoiceReceiptFormClient from "@/app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient"
import { getInitialInvoiceReceiptCreateData } from "@/app/dashboard/documents/invoice-receipt/actions"
import CreditNoteFormClient from "@/app/dashboard/documents/credit-note/CreditNoteFormClient"
import { getInitialCreditNoteCreateData } from "@/app/dashboard/documents/credit-note/actions"

// ── CREDIT NOTE BLOCKED ───────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which is
// exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore credit-note issuance,
// revert the security/credit-note-block commits.
const CREDIT_NOTE_BLOCKED: boolean = true

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
    if (CREDIT_NOTE_BLOCKED) notFound()

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
