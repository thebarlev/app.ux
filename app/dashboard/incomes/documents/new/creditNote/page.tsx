import { notFound } from "next/navigation"
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

export default async function NewIncomeCreditNotePage() {
  // CREDIT NOTE BLOCKED — first statement executed in this component.

  const initial = await getInitialCreditNoteCreateData()
  return <CreditNoteFormClient initial={initial} />
}
