"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { ArrowLeft } from "lucide-react";
import { getAllDocumentConfigs } from "@/lib/documents/document-configs";

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

const DOCUMENT_CONFIGS_BY_DB = new Map(
  getAllDocumentConfigs().map((config) => [config.dbValue, config])
);

const getDocumentTypeLabel = (type: string) => {
  const config = DOCUMENT_CONFIGS_BY_DB.get(type);
  return config?.label || type;
};

const getDocumentPath = (docType: string, docId: string) => {
  const config = DOCUMENT_CONFIGS_BY_DB.get(docType);
  if (!config) return `/dashboard/documents/${docType}/${docId}`;
  const basePath = config.category === "business" ? "/business/documents" : "/dashboard/documents";
  return `${basePath}/${config.routeSegment}/${docId}/summary`;
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "#EDF1F5", text: "#19183B", label: "טיוטה" },
    final: { bg: "#1D868F", text: "#FFFFFF", label: "סופי" },
    cancelled: { bg: "#9B0003", text: "#FFFFFF", label: "בוטל" },
    voided: { bg: "#F39600", text: "#19183B", label: "מבוטל" },
  };
  const style = styles[status] || styles.draft;
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: "5px",
        background: style.bg,
        color: style.text,
        fontSize: "14px",
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
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
      <div className="ui-container pt-10">
        {/* Page Header */}
        <div className="mb-[50px]">
          <Link
            href={`/dashboard/customers/${customer.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
              color: "#19183B",
              textDecoration: "none",
              fontSize: "18px",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={18} />
            חזרה לפרטי הלקוח
          </Link>
          <h1 className="text-right mb-4">
            מסמכים של {customer.name}
          </h1>
          {customer.tax_id && (
            <p className="text-right">
              ת.ז/ח.פ: {customer.tax_id}
            </p>
          )}
        </div>

        {/* Customer Info Section */}
        {(customer.email || customer.phone || customer.mobile) && (
          <FormSection title="פרטי התקשרות" className="mb-[50px]">
            <div className="ui-form-grid">
              {customer.email && (
                <div>
                  <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>אימייל</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#19183B" }}>{customer.email}</div>
                </div>
              )}
              {customer.phone && (
                <div>
                  <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>טלפון</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#19183B", direction: "ltr", textAlign: "right" }}>
                    {customer.phone}
                  </div>
                </div>
              )}
              {customer.mobile && (
                <div>
                  <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>נייד</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#19183B", direction: "ltr", textAlign: "right" }}>
                    {customer.mobile}
                  </div>
                </div>
              )}
            </div>
          </FormSection>
        )}

        {/* Documents List */}
        <FormSection title="מסמכים">
          {initialDocuments.length === 0 ? (
            <div
              style={{
                padding: 60,
                textAlign: "center",
                background: "#FFF",
                borderRadius: 20,
                boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
                color: "#19183B",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
              <h3 style={{ marginBottom: 8 }}>
                אין מסמכים עדיין
              </h3>
              <p style={{ opacity: 0.7, marginBottom: 20 }}>
                טרם נוצרו מסמכים עבור לקוח זה
              </p>
              <Link href="/dashboard/incomes/documents/new/receipt">
                <Button style={{ height: '50px', fontSize: '18px' }}>
                  צור מסמך חדש
                </Button>
              </Link>
            </div>
          ) : (
            <Card style={{ backgroundColor: 'white', border: 'none', boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)' }}>
              <CardContent style={{ padding: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18, color: "#19183B" }}>
                  <thead>
                    <tr style={{ background: "#19183B", borderBottom: "1px solid #EDF1F5" }}>
                      <th style={{ padding: 20, textAlign: "right", fontWeight: 700, color: "#FFFFFF" }}>מספר</th>
                      <th style={{ padding: 20, textAlign: "right", fontWeight: 700, color: "#FFFFFF" }}>סוג</th>
                      <th style={{ padding: 20, textAlign: "right", fontWeight: 700, color: "#FFFFFF" }}>תאריך</th>
                      <th style={{ padding: 20, textAlign: "right", fontWeight: 700, color: "#FFFFFF" }}>סכום</th>
                      <th style={{ padding: 20, textAlign: "right", fontWeight: 700, color: "#FFFFFF" }}>סטטוס</th>
                      <th style={{ padding: 20, textAlign: "center", fontWeight: 700, color: "#FFFFFF" }}>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialDocuments.map((doc, idx) => (
                      <tr
                        key={doc.id}
                        style={{
                          borderBottom: idx < initialDocuments.length - 1 ? "1px solid #EDF1F5" : "none",
                          background: idx % 2 === 0 ? "#FFF" : "#F9FAFB",
                        }}
                      >
                        <td style={{ padding: 20, fontWeight: 600 }}>
                          {doc.document_number || "-"}
                        </td>
                        <td style={{ padding: 20 }}>{getDocumentTypeLabel(doc.document_type)}</td>
                        <td style={{ padding: 20, opacity: 0.8 }}>
                          {new Date(doc.issue_date).toLocaleDateString("he-IL")}
                        </td>
                        <td style={{ padding: 20, direction: "ltr", textAlign: "right" }}>
                          {doc.total_amount.toLocaleString("he-IL")} {doc.currency}
                        </td>
                        <td style={{ padding: 20 }}>{getStatusBadge(doc.document_status)}</td>
                        <td style={{ padding: 20, textAlign: "center" }}>
                          <Link href={getDocumentPath(doc.document_type, doc.id)}>
                            <Button variant="secondary" style={{ height: '40px', fontSize: '16px' }}>
                              צפה
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </FormSection>

        {/* Summary Stats */}
        {initialDocuments.length > 0 && (
          <FormSection title="סיכום" className="mt-[50px]">
            <div className="ui-form-grid">
              <div>
                <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>סה"כ מסמכים</div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#19183B" }}>{initialDocuments.length}</div>
              </div>
              <div>
                <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>מסמכים פעילים</div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#19183B" }}>
                  {initialDocuments.filter((d) => d.document_status === "final").length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "18px", color: "#708993", marginBottom: "8px" }}>סה"כ שולם</div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#19183B" }}>
                  {initialDocuments
                    .filter((d) => d.document_status === "final")
                    .reduce((sum, d) => sum + d.total_amount, 0)
                    .toLocaleString("he-IL")}{" "}
                  ₪
                </div>
              </div>
            </div>
          </FormSection>
        )}
      </div>
    </main>
  );
}
