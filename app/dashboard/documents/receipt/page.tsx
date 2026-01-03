import ReceiptFormClient from "./ReceiptFormClient";
import { getInitialReceiptCreateData } from "./actions";

export default async function Page() {
  const initial = await getInitialReceiptCreateData();

  return (
    <div className="ui-page-dark" dir="rtl">
      <ReceiptFormClient initial={initial} />
    </div>
  );
}
