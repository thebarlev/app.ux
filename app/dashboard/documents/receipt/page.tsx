"use client";

import { useState } from "react";
import StartingNumberModal from "@/components/documents/StartingNumberModal";

<<<<<<< HEAD
export default function ReceiptPage() {
  redirect("/dashboard/documents/new/receipt");
}


=======
export default function ReceiptEntry() {
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>יצירת קבלה</h1>

      {open ? (
        <StartingNumberModal
          documentType="receipt"
          onClose={() => {
            // המשתמש סגר/ביטל
            setOpen(false);
            setReady(false);
          }}
          onSuccess={() => {
            // הצלחה (או כבר היה נעול)
            setOpen(false);
            setReady(true);
          }}
        />
      ) : ready ? (
        <div style={{ marginTop: 12 }}>
          <p>✅ המספור נעול/נשמר. עכשיו נציג כאן את טופס יצירת הקבלה.</p>

          {/* Placeholder לטופס — נחליף לטופס אמיתי בשלב הבא */}
          <div
            style={{
              marginTop: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              maxWidth: 720,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>טופס קבלה (בקרוב)</p>
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              כאן יופיעו שדות: לקוח, תאריך, סכום, אמצעי תשלום, הערות, ועוד.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p>לא המשכת. אפשר לפתוח שוב את חלון המספור.</p>
          <button
            style={{ marginTop: 8 }}
            onClick={() => {
              setOpen(true);
            }}
          >
            פתח חלון
>>>>>>> c055c62 (Add receipt form client + actions and update receipt flow)
