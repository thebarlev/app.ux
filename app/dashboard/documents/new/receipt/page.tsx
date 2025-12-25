import { getSequenceInfoAction } from "@/app/dashboard/document/actions"; // או הנתיב המדויק לקובץ actions.ts שלך
import ReceiptForm from "@/components/documents/receipt-form";            // הנתיב המדויק אצלך
import StartingNumberCard from "@/components/documents/starting-number-card"; // או הקומפוננטה שמציירת את המסך הזה

export default async function Page() {
  const sequenceInfo = await getSequenceInfoAction({ documentType: "receipt" });

  // ✅ אם כבר נעול – מציגים יצירת קבלה
  if (!sequenceInfo.shouldShowModal) {
    return (
      <main dir="rtl" className="p-6">
        <ReceiptForm sequenceInfo={sequenceInfo} />
      </main>
    );
  }

  // ⛔ רק אם באמת צריך לבחור מספר פתיחה
  return (
    <main dir="rtl" className="p-6">
      <StartingNumberCard documentType="receipt" />
    </main>
  );
}
