import { notFound } from "next/navigation"
import CreditNoteFormClient from "@/app/dashboard/documents/credit-note/CreditNoteFormClient"
import { getInitialCreditNoteCreateData } from "@/app/dashboard/documents/credit-note/actions"

// ── CREDIT NOTE BLOCKED ───────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which is
// exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore credit-note issuance,
// revert the security/credit-note-block commits.
//
// THIS is the route that serves /dashboard/incomes/documents/new/creditNote.
// A literal folder segment wins over the sibling [documentType] dynamic segment,
// so the guard added there is never reached for this URL — which is why the form
// still opened after the first three commits.
const CREDIT_NOTE_BLOCKED: boolean = true

export default async function NewIncomeCreditNotePage() {
  // CREDIT NOTE BLOCKED — first statement executed in this component.
  if (CREDIT_NOTE_BLOCKED) notFound()

  const initial = await getInitialCreditNoteCreateData()
  return <CreditNoteFormClient initial={initial} />
}
