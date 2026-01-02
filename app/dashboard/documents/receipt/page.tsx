import ReceiptFormClient from "./ReceiptFormClient";
import { getInitialReceiptCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialReceiptCreateData();

  return (
    <div className="min-h-screen w-full" dir="rtl">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <ReceiptFormClient initial={initial} />
      </div>
    </div>
  );
}
