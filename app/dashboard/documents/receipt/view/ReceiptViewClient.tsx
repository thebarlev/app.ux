"use client";

import { useEffect } from "react";

type Payment = {
  method: string;
  date: string;
  amount: number;
  currency: string;
};

type ReceiptData = {
  id: string;
  document_number: string | null;
  document_status: string;
  issue_date: string | null;
  customer_name: string;
  description: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  total_amount: number;
  currency: string;
  created_at: string;
};

type Props = {
  receipt: ReceiptData;
  companyName: string;
  companyDetails?: {
    logoUrl?: string;
    businessType?: string;
    registrationNumber?: string;
    address?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    website?: string;
  };
};

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("he-IL");
  } catch {
    return dateStr;
  }
}

export default function ReceiptViewClient({ receipt, companyName, companyDetails }: Props) {
  useEffect(() => {
    document.title = `קבלה${receipt.document_number ? ` - ${receipt.document_number}` : ""} - ${companyName}`;
  }, [receipt.document_number, companyName]);

  // Mock payment data (replace with actual payment rows when available)
  const payments: Payment[] = [
    {
      method: "מזומן",
      date: receipt.issue_date || "",
      amount: receipt.total_amount,
      currency: receipt.currency,
    },
  ];

  const getBusinessTypeLabel = (type?: string): string => {
    if (!type) return "";
    const labels: Record<string, string> = {
      osek_patur: "עוסק פטור",
      osek_murshe: "עוסק מורשה",
      ltd: 'חברה בע"מ',
      partnership: "שותפות",
      other: "אחר",
    };
    return labels[type] || type;
  };

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111827", paddingBottom: 20, marginBottom: 24 }}>
          {/* Logo on left */}
          {companyDetails?.logoUrl && (
            <div style={{ width: 80, height: 80, overflow: "hidden", borderRadius: 8 }}>
              <img 
                src={companyDetails.logoUrl} 
                alt="Company Logo" 
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}

          {/* Company details on right */}
          <div style={{ textAlign: "right", flex: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 4 }}>
              {companyName}
            </div>
            
            {companyDetails && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
                {companyDetails.businessType && (
                  <div>{getBusinessTypeLabel(companyDetails.businessType)}</div>
                )}
                {companyDetails.registrationNumber && (
                  <div>מספר רישום: {companyDetails.registrationNumber}</div>
                )}
                {companyDetails.address && <div>{companyDetails.address}</div>}
                {companyDetails.phone && <div>טלפון: {companyDetails.phone}</div>}
                {companyDetails.mobile && <div>נייד: {companyDetails.mobile}</div>}
                {companyDetails.email && <div>{companyDetails.email}</div>}
                {companyDetails.website && <div>{companyDetails.website}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Title and Number */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
            קבלה
          </div>
          {receipt.document_number && (
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, color: "#6b7280" }}>
              מספר: {receipt.document_number}
            </div>
          )}
          {receipt.document_status === "draft" && (
            <div style={{ 
              display: "inline-block",
              marginTop: 12,
              padding: "6px 16px",
              background: "#fef3c7",
              color: "#92400e",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
            }}>
              טיוטה
            </div>
          )}
        </div>

        {/* Document Info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>תאריך הנפקה:</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDate(receipt.issue_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>שם הלקוח:</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{receipt.customer_name || "—"}</div>
          </div>
        </div>

        {receipt.description && (
          <div style={{ marginBottom: 24, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>תיאור:</div>
            <div style={{ fontSize: 14 }}>{receipt.description}</div>
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
            פירוט תשלומים
          </div>
          <table style={{ 
            width: "100%", 
            borderCollapse: "collapse",
            border: "1px solid #e5e7eb"
          }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ 
                  padding: "12px 16px", 
                  textAlign: "right", 
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  אמצעי תשלום
                </th>
                <th style={{ 
                  padding: "12px 16px", 
                  textAlign: "right", 
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  תאריך
                </th>
                <th style={{ 
                  padding: "12px 16px", 
                  textAlign: "left", 
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  סכום
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                    {payment.method}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                    {formatDate(payment.date)}
                  </td>
                  <td style={{ 
                    padding: "12px 16px", 
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "left",
                    fontWeight: 600
                  }}>
                    {formatMoney(payment.amount, payment.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Amount */}
        <div style={{ 
          padding: 20,
          background: "#f9fafb",
          border: "2px solid #111827",
          borderRadius: 12,
          marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>סה״כ לתשלום:</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#111827" }}>
              {formatMoney(receipt.total_amount, receipt.currency)}
            </div>
          </div>
        </div>

        {/* Internal Notes */}
        {receipt.internal_notes && (
          <div style={{ 
            marginBottom: 16,
            padding: 16,
            background: "#fef3c7",
            borderRadius: 8,
            border: "1px solid #fbbf24"
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
              הערות פנימיות:
            </div>
            <div style={{ fontSize: 14, color: "#78350f" }}>
              {receipt.internal_notes}
            </div>
          </div>
        )}

        {/* Customer Notes */}
        {receipt.customer_notes && (
          <div style={{ 
            marginBottom: 16,
            padding: 16,
            background: "#dbeafe",
            borderRadius: 8,
            border: "1px solid #3b82f6"
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1e40af", marginBottom: 6 }}>
              הערות ללקוח:
            </div>
            <div style={{ fontSize: 14, color: "#1e3a8a" }}>
              {receipt.customer_notes}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid #e5e7eb",
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280"
        }}>
          <div>מסמך זה הופק באופן דיגיטלי</div>
          <div style={{ marginTop: 4 }}>
            תאריך הדפסה: {formatDate(new Date().toISOString())}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
            לייצוא PDF: Ctrl+P (Windows) או Cmd+P (Mac)
          </div>
        </div>
      </div>
    </div>
  );
}
