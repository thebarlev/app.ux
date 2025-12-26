import ReceiptFormClient from "./ReceiptFormClient";
import { getInitialReceiptCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialReceiptCreateData();

  return (
    <div dir="rtl" style={{ padding: 24 }}>
      <ReceiptFormClient initial={initial} />
    </div>
  );
}
