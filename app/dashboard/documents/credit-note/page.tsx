import CreditNoteFormClient from "./CreditNoteFormClient";
import { getInitialCreditNoteCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialCreditNoteCreateData();

  return <CreditNoteFormClient initial={initial} />;
}
