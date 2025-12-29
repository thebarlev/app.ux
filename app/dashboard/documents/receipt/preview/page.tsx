import { Suspense } from "react";
import PreviewClient from "./PreviewClient";

export default function ReceiptPreviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>טוען...</div>}>
      <PreviewClient />
    </Suspense>
  );
}
