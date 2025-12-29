"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("he-IL");
  } catch {
    return dateStr;
  }
}

export default function PreviewClient() {
  const searchParams = useSearchParams();

  // Parse data from URL parameters
  const previewNumber = searchParams.get("previewNumber") || null;
  const companyName = searchParams.get("companyName") || "העסק שלי";
  const customerName = searchParams.get("customerName") || "";
  const documentDate = searchParams.get("documentDate") || "";
  const description = searchParams.get("description") || "";
  const notes = searchParams.get("notes") || "";
  const footerNotes = searchParams.get("footerNotes") || "";
  const total = parseFloat(searchParams.get("total") || "0");
  const currency = searchParams.get("currency") || "₪";
  
  // Parse payments JSON
  let payments: Array<{ method: string; date: string; amount: number; currency: string }> = [];
  try {
    const paymentsStr = searchParams.get("payments");
    if (paymentsStr) {
      payments = JSON.parse(paymentsStr);
    }
  } catch (e) {
    console.error("Failed to parse payments:", e);
  }

  // Enable print-friendly styling on mount
  useEffect(() => {
    document.title = `קבלה${previewNumber ? ` - ${previewNumber}` : ""} - ${companyName}`;
  }, [previewNumber, companyName]);

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "white", padding: "40px 20px" }}>
      {/* Receipt Document - Clean Print-Ready View */}
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 60,
        fontFamily: "Arial, sans-serif",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", borderBottom: "2px solid #111827", paddingBottom: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
            {companyName}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
            קבלה
          </div>
          {previewNumber && (
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, color: "#6b7280" }}>
              מספר: {previewNumber}
            </div>
          )}
        </div>

        {/* Document Info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>תאריך הנפקה:</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDate(documentDate)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>שם הלקוח:</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{customerName || "—"}</div>
          </div>
        </div>

        {description && (
          <div style={{ marginBottom: 24, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>תיאור:</div>
            <div style={{ fontSize: 14 }}>{description}</div>
          </div>
        )}

        {/* Payments Table */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ 
            fontSize: 16, 
            fontWeight: 700, 
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: "1px solid #e5e7eb"
          }}>
            פירוט תקבולים
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ padding: 12, textAlign: "right", fontSize: 13, fontWeight: 600 }}>אמצעי תשלום</th>
                <th style={{ padding: 12, textAlign: "right", fontSize: 13, fontWeight: 600 }}>תאריך</th>
                <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 600 }}>סכום</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 20, textAlign: "center", opacity: 0.5 }}>
                    אין תקבולים
                  </td>
                </tr>
              ) : (
                payments.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 12, fontSize: 14 }}>{p.method || "—"}</td>
                    <td style={{ padding: 12, fontSize: 14 }}>{formatDate(p.date)}</td>
                    <td style={{ padding: 12, textAlign: "left", fontSize: 14, fontWeight: 500 }}>
                      {formatMoney(p.amount, p.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          padding: 16,
          background: "#f9fafb",
          borderRadius: 8,
          border: "2px solid #111827",
          marginBottom: 24
        }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>סה״כ לתשלום:</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#111827" }}>
            {formatMoney(total, currency)}
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div style={{ marginBottom: 16, padding: 12, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>הערות פנימיות:</div>
            <div style={{ fontSize: 13, color: "#78350f" }}>{notes}</div>
          </div>
        )}

        {footerNotes && (
          <div style={{ marginBottom: 16, padding: 12, background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#075985", marginBottom: 4 }}>הערות ללקוח:</div>
            <div style={{ fontSize: 13, color: "#0c4a6e" }}>{footerNotes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #e5e7eb",
          textAlign: "center",
          fontSize: 11,
          color: "#6b7280"
        }}>
          <div>מסמך זה הופק באופן דיגיטלי</div>
          <div style={{ marginTop: 4 }}>
            תאריך תצוגה: {new Date().toLocaleDateString("he-IL")}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, opacity: 0.7 }}>
            לייצוא PDF: Ctrl+P (Windows) או Cmd+P (Mac)
          </div>
        </div>
      </div>
    </div>
  );
}
