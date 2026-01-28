import ReceiptFormClient from "./ReceiptFormClient";
import { getInitialReceiptCreateData } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const initial = await getInitialReceiptCreateData();

  return <ReceiptFormClient initial={initial} />;
}
