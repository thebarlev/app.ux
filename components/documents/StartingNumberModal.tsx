"use client";

import { useState } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";

type Props = {
  documentType: string;
  onClose: () => void;
};

export default function StartingNumberModal({
  documentType,
  onClose,
}: Props) {
  const [startingNumber, setStartingNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setLoading(true);
    setError(null);

    const res = await lockStartingNumberAction({
      documentType,
      startingNumber,
      prefix: null,
    });

    setLoading(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    onClose();
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
      <h3>בחירת מספר מסמך ראשון</h3>

      <p>מספור מסמכים הוא חד־פעמי ואינו ניתן לשינוי.</p>

      <input
        type="number"
        min={1}
        value={startingNumber}
        onChange={(e) => setStartingNumber(Number(e.target.value))}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: 12 }}>
        <button onClick={onConfirm} disabled={loading}>
          {loading ? "שומר..." : "אישור"}
        </button>
        <button onClick={onClose} style={{ marginLeft: 8 }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
