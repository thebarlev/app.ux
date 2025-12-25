import { getSequenceInfoAction } from "@/app/dashboard/document/actions";
import ReceiptForm from "@/components/documents/receipt-form";
import StartingNumberCard from "@/components/documents/starting-number-card";

export default async function NewReceiptPage() {
  const sequenceInfo = await getSequenceInfoAction({
    documentType: "receipt",
  });

  // ⛔ אם עדיין לא נעול – מבקשים מספר פתיחה
  if (sequenceInfo.shouldShowModal) {
    return (
      <main dir="rtl" style={{ padding: 24 }}>
        <StartingNumberCard documentType="receipt" />
      </main>
    );
  }

  // ✅ אם נעול – עוברים ליצירת קבלה
  return (
    <main dir="rtl" style={{ padding: 24 }}>
      <ReceiptForm sequenceInfo={sequenceInfo} />
    </main>
  );
}

