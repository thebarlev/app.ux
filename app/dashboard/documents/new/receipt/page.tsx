import StartingNumberModal from "./StartingNumberModal";
import ReceiptForm from "@/components/documents/receipt-form";
import { getSequenceInfoAction } from "@/app/dashboard/documents/actions";

export const dynamic = "force-dynamic";

export default async function CreateReceiptPage() {
  // מביאים מידע אמיתי מהשרת:
  // האם המספור נעול, ומה המספר הבא וכו'
  const sequenceInfo = await getSequenceInfoAction({ documentType: "receipt" });

  // אם כבר נעול (או אם כבר יש issued) - לא מציגים בחירת מספר.
  if (!sequenceInfo.shouldShowModal) {
    return (
      <main dir="rtl" style={{ padding: 24 }}>
        <ReceiptForm sequenceInfo={sequenceInfo} />
      </main>
    );
  }

  // אם צריך לבחור מספר פתיחה (פעם ראשונה בלבד)
  return (
    <main dir="rtl" style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
        <div style={{ width: "min(720px, 100%)" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
            Create Receipt
          </h1>

          <StartingNumberModal
            documentType="receipt"
            onClose={() => {
              // אין כאן router (זה Server Component).
              // אחרי שה-modal ננעל, ה-modal עצמו עושה router.refresh()
              // והעמוד ירונדר מחדש ויעבור לטופס יצירת קבלה.
            }}
          />
        </div>
      </div>
    </main>
  );
}
