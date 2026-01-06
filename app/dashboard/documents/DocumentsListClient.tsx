"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentsListFilters, DocumentsListResult } from "./actions";
import { getReceiptPreviewUrlAction } from "./receipts/actions";

type Props = {
  initialData: { ok: boolean; data?: DocumentsListResult; message?: string };
  initialFilters: DocumentsListFilters;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const curr = currency || "ILS";
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr === "ILS" ? "₪" : curr}`;
}

function getDocumentTypeLabel(type: string): string {
  switch (type) {
    case "receipt":
      return "קבלה";
    case "invoice":
      return "חשבונית";
    case "quote":
      return "הצעת מחיר";
    default:
      return type;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "ui-badge-warning";
    case "final":
      return "ui-badge-success";
    case "void":
    case "cancelled":
      return "ui-badge-danger";
    default:
      return "ui-badge";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "טיוטה";
    case "final":
      return "הופק";
    case "void":
      return "בוטל";
    case "cancelled":
      return "מבוטל";
    default:
      return status;
  }
}

export default function DocumentsListClient({ initialData, initialFilters }: Props) {
  const router = useRouter();

  const [search, setSearch] = useState(initialFilters.search || "");
  const [documentType, setDocumentType] = useState(initialFilters.documentType || "all");

  if (!initialData.ok) {
    return (
      <div className="ui-alert-danger">
        <div className="font-bold">שגיאה</div>
        <div className="mt-2">{initialData.message}</div>
      </div>
    );
  }

  const { documents, totalCount, page, pageSize } = initialData.data!;
  const totalPages = Math.ceil(totalCount / pageSize);

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (documentType && documentType !== "all") params.set("documentType", documentType);
    params.set("page", "1");

    router.push(`/dashboard/documents?${params.toString()}`);
  }

  function resetFilters() {
    setSearch("");
    setDocumentType("all");
    router.push("/dashboard/documents");
  }

  function goToPage(newPage: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (documentType && documentType !== "all") params.set("documentType", documentType);
    params.set("page", newPage.toString());

    router.push(`/dashboard/documents?${params.toString()}`);
  }

  return (
    <div className="ui-container pt-10" style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div className="mb-[50px]">
        <h1 className="text-right text-4xl font-semibold text-[#19183B] mb-4">
          מסמכים
        </h1>
        <p className="text-right text-[#708993] text-lg">
          {totalCount} מסמכים סה״כ
        </p>
      </div>

      {/* Search Section */}
      <FormSection title="חיפוש וסינון">
        <div className="ui-form-grid">
          <FieldWrapper label="חיפוש לפי מספר מסמך או שם לקוח" id="search" className="!w-full">
            <Input
              id="search"
              type="text"
              placeholder="חיפוש לפי מספר מסמך או שם לקוח..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applyFilters();
                }
              }}
            />
          </FieldWrapper>

          <FieldWrapper label="סוג מסמך" id="documentType">
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                <SelectItem value="receipt">קבלה</SelectItem>
                <SelectItem value="invoice">חשבונית</SelectItem>
                <SelectItem value="quote">הצעת מחיר</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <Button onClick={applyFilters} style={{ height: '50px', fontSize: '18px' }}>
            חפש
          </Button>
          <Button onClick={resetFilters} variant="secondary" style={{ height: '50px', fontSize: '18px' }}>
            איפוס
          </Button>
        </div>
      </FormSection>

      {/* Documents List */}
      <div className="mt-[50px]">
        <FormSection title="רשימת מסמכים">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p style={{ fontSize: '18px', color: '#708993' }}>לא נמצאו מסמכים</p>
              </CardContent>
            </Card>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#19183B', color: '#FFFFFF' }}>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>מספר מסמך</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>סוג</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>תאריך</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>לקוח</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>סכום</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>סטטוס</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '18px', fontWeight: 600, borderBottom: '2px solid #EDF1F5' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc, index) => (
                    <tr
                      key={doc.id}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#EDF1F5',
                        borderBottom: '1px solid #EDF1F5',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#C6EAE5';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#FFFFFF' : '#EDF1F5';
                      }}
                    >
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '18px', color: '#19183B' }}>
                        {doc.document_number || "—"}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '18px', color: '#19183B' }}>
                        {getDocumentTypeLabel(doc.document_type)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '18px', color: '#19183B' }}>
                        {formatDate(doc.document_date)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '18px', color: '#19183B' }}>
                        {doc.customer_name || "—"}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '18px', color: '#19183B' }}>
                        {formatAmount(doc.total_amount, doc.currency)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <span
                          className={getStatusBadgeClass(doc.document_status)}
                          style={{
                            display: 'inline-block',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: 600,
                          }}
                        >
                          {getStatusLabel(doc.document_status)}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        {doc.document_type === "receipt" ? (
                          <Button
                            onClick={async () => {
                              const result = await getReceiptPreviewUrlAction(doc.id);
                              if (result.ok && result.url) {
                                window.open(result.url, "_blank");
                              } else {
                                alert(result.message || "שגיאה בפתיחת תצוגה מקדימה");
                              }
                            }}
                            variant="secondary"
                            style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                          >
                            צפייה
                          </Button>
                        ) : (
                          <span style={{ color: '#708993' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
              <Button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                variant="secondary"
                style={{ height: '40px', fontSize: '16px' }}
              >
                הקודם
              </Button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: '18px', color: '#19183B' }}>
                עמוד {page} מתוך {totalPages}
              </span>
              <Button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                variant="secondary"
                style={{ height: '40px', fontSize: '16px' }}
              >
                הבא
              </Button>
            </div>
          )}
        </FormSection>
      </div>
    </div>
  );
}
