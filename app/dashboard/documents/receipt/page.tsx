import ReceiptFormClient from "./ReceiptFormClient";
import { getInitialReceiptCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialReceiptCreateData();

  return <ReceiptFormClient initial={initial} />;
}
