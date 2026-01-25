import CreditNoteFormClient from "@/app/dashboard/documents/credit-note/CreditNoteFormClient"
import { getInitialCreditNoteCreateData } from "@/app/dashboard/documents/credit-note/actions"

export default async function NewIncomeCreditNotePage() {
  const initial = await getInitialCreditNoteCreateData()
  return <CreditNoteFormClient initial={initial} />
}
