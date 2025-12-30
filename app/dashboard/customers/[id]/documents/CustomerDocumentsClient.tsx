"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  tax_id: string | null;
};

type Document = {
  id: string;
  document_type: string;
  document_number: string | null;
  document_status: string;
  issue_date: string;
  total_amount: number;
  currency: string;
  customer_name: string;
  created_at: string;
};

type Props = {
  customer: Customer;
  initialDocuments: Document[];
};

const getDocumentTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    receipt: "קבלה",
    tax_invoice: "חשבונית מס",
    invoice_receipt: "חשבונית מס/קבלה",
    quote: "הצעת מחיר",
    delivery_note: "תעודת משלוח",
    credit_invoice: "חשבונית זיכוי",
  };
  return labels[type] || type;
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "#f3f4f6", text: "#374151", label: "טיוטה" },
    final: { bg: "#d1fae5", text: "#065f46", label: "סופי" },
    cancelled: { bg: "#fee2e2", text: "#991b1b", label: "בוטל" },
    voided: { bg: "#fef3c7", text: "#92400e", label: "מבוטל" },
  };
  const style = styles[status] || styles.draft;
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 12,
        background: style.bg,
        color: style.text,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {style.label}
    </span>
  );
};

export default function CustomerDocumentsClient({ customer, initialDocuments }: Props) {
  const router = useRouter();

  return (
    <div dir="rtl" style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link
          href={`/dashboard/customers/${customer.id}`}
          style={{
            display: "inline-block",
            marginBottom: 16,
            color: "#3b82f6",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          ← חזרה לפרטי הלקוח
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
          מסמכים של {customer.name}
        </h1>
        {customer.tax_id && (
          <p style={{ marginTop: 8, opacity: 0.75 }}>ת.ז/ח.פ: {customer.tax_id}</p>
        )}
      </div>

      {/* Customer Info Card */}
      <div
        style={{
          padding: 20,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          marginBottom: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {customer.email && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>אימייל</div>
            <div style={{ fontWeight: 600 }}>{customer.email}</div>
          </div>
        )}
        {customer.phone && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>טלפון</div>
            <div style={{ fontWeight: 600, direction: "ltr", textAlign: "right" }}>
              {customer.phone}
            </div>
          </div>
        )}
        {customer.mobile && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>נייד</div>
            <div style={{ fontWeight: 600, direction: "ltr", textAlign: "right" }}>
              {customer.mobile}
            </div>
          </div>
        )}
      </div>

      {/* Documents List */}
      {initialDocuments.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            אין מסמכים עדיין
          </h3>
          <p style={{ opacity: 0.6, marginBottom: 20 }}>
            טרם נוצרו מסמכים עבור לקוח זה
          </p>
          <Link
            href="/dashboard/documents/receipt"
            style={{
              padding: "10px 20px",
              background: "#111827",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            צור מסמך חדש
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>מספר</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>סוג</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>תאריך</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>סכום</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>סטטוס</th>
                <th style={{ padding: 16, textAlign: "center", fontWeight: 700 }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {initialDocuments.map((doc, idx) => (
                <tr
                  key={doc.id}
                  style={{
                    borderBottom:
                      idx < initialDocuments.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <td style={{ padding: 16, fontWeight: 600 }}>
                    {doc.document_number || "-"}
                  </td>
                  <td style={{ padding: 16 }}>{getDocumentTypeLabel(doc.document_type)}</td>
                  <td style={{ padding: 16, opacity: 0.7 }}>
                    {new Date(doc.issue_date).toLocaleDateString("he-IL")}
                  </td>
                  <td style={{ padding: 16, direction: "ltr", textAlign: "right" }}>
                    {doc.total_amount.toLocaleString("he-IL")} {doc.currency}
                  </td>
                  <td style={{ padding: 16 }}>{getStatusBadge(doc.document_status)}</td>
                  <td style={{ padding: 16, textAlign: "center" }}>
                    <Link
                      href={`/dashboard/documents/${doc.document_type}/${doc.id}`}
                      style={{
                        padding: "6px 16px",
                        background: "#f3f4f6",
                        color: "#111827",
                        borderRadius: 8,
                        textDecoration: "none",
                        fontSize: 14,
                        fontWeight: 600,
                        display: "inline-block",
                      }}
                    >
                      צפה
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Stats */}
      {initialDocuments.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>סה"כ מסמכים</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{initialDocuments.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>מסמכים פעילים</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>
              {initialDocuments.filter((d) => d.document_status === "final").length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>סה"כ שולם</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>
              {initialDocuments
                .filter((d) => d.document_status === "final")
                .reduce((sum, d) => sum + d.total_amount, 0)
                .toLocaleString("he-IL")}{" "}
              ₪
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
