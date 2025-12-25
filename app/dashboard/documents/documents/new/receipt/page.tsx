"use client";

import { useState } from "react";
import StartingNumberModal from "@/components/documents/StartingNumberModal";

export default function CreateReceiptPage() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Create Receipt</h1>

      {open ? (
        <StartingNumberModal
          documentType="receipt"
          onClose={() => setOpen(false)}
        />
      ) : (
        <p>✅ Modal closed. Next step: issue receipt.</p>
      )}
    </div>
  );
}
