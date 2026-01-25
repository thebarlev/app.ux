import ReceiptFormClient from "@/app/dashboard/documents/receipt/ReceiptFormClient"
import { getInitialReceiptCreateData } from "@/app/dashboard/documents/receipt/actions"
export default async function NewIncomeReceiptPage() {
  const initial = await getInitialReceiptCreateData()
  return <ReceiptFormClient initial={initial} />
}
