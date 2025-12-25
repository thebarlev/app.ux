import { getSequenceInfoAction } from "@/app/dashboard/document/actions"; // או הנתיב המדויק אצלך
import ReceiptForm from "@/components/documents/receipt-form"; // הנתיב המדויק אצלך
import StartingNumberCard from "@/components/documents/starting-number-card"; // אם זה השם אצלך

export default async function NewReceiptPage() {
  const sequenceInfo = await getSequenceInfoAction({ documentType: "receipt" });

  // ✅ אם כבר נעול/או יש issued — לא מציגים מסך בחירת מספר
  if (!sequenceInfo.shouldShowModal) {
    return (
      <main dir="rtl" style={{ padding: 24 }}>
        <ReceiptForm sequenceInfo={sequenceInfo} />
      </main>
    );
  }

  // ⛔ רק אם צריך באמת לבחור מספר פתיחה
  return (
    <main dir="rtl" style={{ padding: 24 }}>
      <StartingNumberCard documentType="receipt" />
    </main>
  );
}
