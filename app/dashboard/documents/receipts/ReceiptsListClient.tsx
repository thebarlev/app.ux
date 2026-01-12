"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReceiptsListFilters, ReceiptsListResult } from "./actions";
import { exportReceiptsCSVAction, getReceiptPreviewUrlAction } from "./actions";

type Props = {
  initialData: { ok: boolean; data?: ReceiptsListResult; message?: string };
  initialFilters: ReceiptsListFilters;
};

type ReceiptsTabStatus = "non_draft" | "draft" | "final" | "void";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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

function normalizeDescription(description: string | null | undefined): string {
  return typeof description === "string" ? description.trim() : "";
}

async function downloadPdf(opts: { documentId: string; fileName: string; issue: "original" | "copy"; lang: "he" | "en" }) {
  const url = `/api/documents/${opts.documentId}/pdf?issue=${opts.issue}&lang=${opts.lang}`
  const res = await fetch(url)
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    const message = (json && (json.message || json.details || json.error)) || res.statusText
    throw new Error(message)
  }
  const blob = await res.blob()
  if (!blob || blob.size === 0) throw new Error("Downloaded PDF is empty")
  const pdfBlob = new Blob([blob], { type: "application/pdf" })
  const downloadUrl = window.URL.createObjectURL(pdfBlob)
  const link = document.createElement("a")
  link.href = downloadUrl
  link.download = opts.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(downloadUrl)
}

export default function ReceiptsListClient({ initialData, initialFilters }: Props) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState(initialFilters.search || "");
  const normalizeStatus = (s: ReceiptsListFilters["status"] | undefined): ReceiptsTabStatus => {
    if (!s || s === "all") return "non_draft";
    return s as ReceiptsTabStatus;
  };
  const [status, setStatus] = useState<ReceiptsTabStatus>(normalizeStatus(initialFilters.status));
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialFilters.dateTo || "");

  if (!initialData.ok) {
    return (
      <div className="ui-alert-danger">
        <div className="font-bold">שגיאה</div>
        <div className="mt-2">{initialData.message}</div>
      </div>
    );
  }

  const { receipts, totalCount, page, pageSize, draftCount } = initialData.data!;
  const totalPages = Math.ceil(totalCount / pageSize);

  const activeTab: "receipts" | "drafts" = status === "draft" ? "drafts" : "receipts";

  // IMPORTANT: server already sorts (issue_date desc, then created_at desc) for correct pagination.
  const sortedReceipts = receipts;

  function pushWithFilters(nextStatus: ReceiptsTabStatus, nextPage = 1) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (nextStatus !== "non_draft") params.set("status", nextStatus);
    params.set("page", nextPage.toString());

    router.push(`/dashboard/documents/receipts?${params.toString()}`);
  }

  function setTab(tab: "receipts" | "drafts") {
    const nextStatus: ReceiptsTabStatus = tab === "drafts" ? "draft" : "non_draft";
    setStatus(nextStatus);
    pushWithFilters(nextStatus, 1);
  }

  function applyFilters() {
    pushWithFilters(status, 1);
  }

  function resetFilters() {
    setSearch("");
    setStatus("non_draft");
    setDateFrom("");
    setDateTo("");
    router.push("/dashboard/documents/receipts");
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportReceiptsCSVAction({
        search,
        status: status as any,
        dateFrom,
        dateTo,
      });

      if (result.ok && result.csv) {
        // Download CSV
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `receipts_${new Date().toISOString().split("T")[0]}.csv`;
        link.click();
      } else {
        alert(result.message || "שגיאה ביצוא");
      }
    } finally {
      setExporting(false);
    }
  }

  function goToPage(newPage: number) {
    pushWithFilters(status, newPage);
  }

  return (
    <div className="ui-container pt-10" style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div className="mb-[50px]">
        <h1 className="text-right mb-4">
          קבלות
        </h1>
        <p className="text-right">
          {activeTab === "drafts" ? `${totalCount} טיוטות סה״כ` : `${totalCount} קבלות סה״כ`}
        </p>

        <div className="mt-4 flex justify-end">
          <Tabs value={activeTab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="receipts">קבלות</TabsTrigger>
              <TabsTrigger value="drafts">{`טיוטות ${draftCount}`}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mb-[50px]">
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ 
            height: '50px', 
            fontSize: '18px', 
            color: '#19183B',
            background: 'transparent',
            border: 'none',
            textDecoration: 'underline',
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.5 : 1,
            padding: 0
          }}
        >
          {exporting ? "מייצא..." : "ייצוא CSV"}
        </button>

        <Link href="/dashboard/documents/receipt">
          <Button 
            style={{ height: '50px', fontSize: '18px' }}
          >
            קבלה חדשה
          </Button>
        </Link>
      </div>

      {/* Filters Section */}
      <FormSection title="סינון וחיפוש">
        <div style={{ display: 'grid', gridTemplateColumns: '220px 180px 180px 180px auto auto', gap: '20px', alignItems: 'end' }}>
          <FieldWrapper label="חיפוש חופשי" id="search" className="!w-[220px]">
            <Input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FieldWrapper>

          {activeTab === "receipts" && (
            <FieldWrapper label="סטטוס" id="status" className="!w-[180px]">
              <Select
                value={status}
                  onValueChange={(value) => setStatus(normalizeStatus(value as any))}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_draft">הכל</SelectItem>
                  <SelectItem value="final">הופקו בלבד</SelectItem>
                  <SelectItem value="void">מבוטלים</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}

          <FieldWrapper label="מתאריך" id="dateFrom" className="!w-[180px]">
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FieldWrapper>

          <FieldWrapper label="עד תאריך" id="dateTo" className="!w-[180px]">
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FieldWrapper>

          <Button
            onClick={applyFilters}
            variant="ghost"
            style={{ height: '50px', fontSize: '18px', color: '#19183B', fontWeight: 600, textDecoration: 'underline', background: 'transparent', border: 'none' }}
          >
            החל סינון
          </Button>

          <Button
            onClick={resetFilters}
            variant="ghost"
            style={{ height: '50px', fontSize: '18px', color: '#19183B', fontWeight: 400, background: 'transparent', border: 'none', marginLeft: '20px' }}
          >
            איפוס
          </Button>
        </div>
      </FormSection>

      {/* Table Section */}
      <div className="mt-[50px]">
        <FormSection title="רשימת קבלות">
          <div className="overflow-x-auto -mx-[50px] -mb-[30px] pl-[50px]">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead style={{ borderBottom: '2px solid #19183B' }}>
                <tr>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>מספר קבלה</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>תאריך</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>לקוח</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>תיאור</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>סכום</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>סטטוס</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '18px', fontWeight: 500, color: '#19183B' }}>פעולות</th>
                </tr>
              </thead>

              <tbody>
                {sortedReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <div className="flex flex-col items-center gap-4">
                        <div className="text-5xl">📭</div>
                        <div className="text-lg font-semibold" style={{ color: '#19183B' }}>
                          {search || status !== "non_draft" || dateFrom || dateTo 
                            ? "לא נמצאו קבלות התואמות את החיפוש"
                            : "עדיין לא יצרת קבלות"
                          }
                        </div>
                        {!search && status === "non_draft" && !dateFrom && !dateTo && (
                          <Link href="/dashboard/documents/receipt">
                            <Button className="mt-2" style={{ height: '50px', fontSize: '18px' }}>
                              צור קבלה ראשונה
                            </Button>
                          </Link>
                        )}
                        {(search || status !== "non_draft" || dateFrom || dateTo) && (
                          <Button
                            onClick={resetFilters}
                            variant="secondary"
                            className="mt-2"
                            style={{ height: '50px', fontSize: '18px', borderColor: '#1A8299', color: '#1A8299' }}
                          >
                            נקה סינונים
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedReceipts.map((receipt) => {
                    const desc = normalizeDescription(receipt.description);
                    const hasDescription = desc.length > 0;
                    return (
                    <tr key={receipt.id} style={{ borderBottom: '1px solid #FFFFFF' }}>
                      <td style={{ padding: '16px 12px', fontSize: '18px', color: '#19183B', fontWeight: 600 }}>
                        {receipt.status === "draft" ? (
                          <span style={{ color: '#708993', fontSize: '14px', fontWeight: 400 }}>טיוטה</span>
                        ) : (
                          receipt.document_number || <span style={{ color: '#708993' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', fontSize: '18px', color: '#19183B' }}>{formatDate(receipt.document_date)}</td>
                      <td style={{ padding: '16px 12px', fontSize: '18px', color: '#19183B' }}>{receipt.customer_name}</td>
                      <td style={{ padding: '16px 12px', fontSize: '18px', color: '#19183B', maxWidth: '200px' }} className="truncate">
                        {hasDescription ? (
                          <span title={desc}>{desc}</span>
                        ) : (
                          <span style={{ color: '#991B1B', fontWeight: 600 }}>תיאור חסר</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', fontSize: '18px', color: '#19183B', fontWeight: 600 }}>
                        {formatAmount(receipt.amount, receipt.currency)}
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span 
                          style={{ 
                            padding: '4px 12px', 
                            borderRadius: '5px',
                            fontSize: '14px',
                            fontWeight: 500,
                            backgroundColor: receipt.status === 'draft' ? '#FEF3C7' : receipt.status === 'final' ? '#D1FAE5' : '#FEE2E2',
                            color: receipt.status === 'draft' ? '#92400E' : receipt.status === 'final' ? '#065F46' : '#991B1B'
                          }}
                        >
                          {getStatusLabel(receipt.status)}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div className="flex gap-2">
                          {receipt.status === "draft" ? (
                            <Link href={`/dashboard/documents/receipt?draftId=${receipt.id}`}>
                              <Button 
                                variant="secondary"
                                style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                              >
                                עריכה
                              </Button>
                            </Link>
                          ) : (
                            <>
                              <Button
                                onClick={async () => {
                                  if (!hasDescription) {
                                    alert("תיאור הוא שדה חובה");
                                    return;
                                  }
                                  const result = await getReceiptPreviewUrlAction(receipt.id);
                                  if (result.ok && result.url) {
                                    window.open(result.url, "_blank");
                                  } else {
                                    alert(result.message || "Failed to open preview");
                                  }
                                }}
                                disabled={!hasDescription}
                                variant="secondary"
                                style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                                title={!hasDescription ? "תיאור הוא שדה חובה" : undefined}
                              >
                                צפייה
                              </Button>
                              <Button
                                onClick={async () => {
                                  if (!hasDescription) {
                                    alert("תיאור הוא שדה חובה");
                                    return;
                                  }
                                  try {
                                    await downloadPdf({
                                      documentId: receipt.id,
                                      issue: "original",
                                      lang: "he",
                                      fileName: `receipt-${receipt.document_number || receipt.id}-original-he.pdf`,
                                    })
                                  } catch (error: any) {
                                    alert(`שגיאה בהורדת PDF: ${error.message}`);
                                  }
                                }}
                                disabled={!hasDescription}
                                style={{ height: '40px', fontSize: '16px' }}
                                title={!hasDescription ? "תיאור הוא שדה חובה" : undefined}
                              >
                                הורד מקור
                              </Button>
                              <Button
                                onClick={async () => {
                                  if (!hasDescription) {
                                    alert("תיאור הוא שדה חובה");
                                    return;
                                  }
                                  try {
                                    await downloadPdf({
                                      documentId: receipt.id,
                                      issue: "copy",
                                      lang: "he",
                                      fileName: `receipt-${receipt.document_number || receipt.id}-copy-he.pdf`,
                                    })
                                  } catch (error: any) {
                                    alert(`שגיאה בהורדת PDF: ${error.message}`);
                                  }
                                }}
                                disabled={!hasDescription}
                                variant="secondary"
                                style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                                title={!hasDescription ? "תיאור הוא שדה חובה" : undefined}
                              >
                                הורד העתק
                              </Button>
                              <Button
                                onClick={async () => {
                                  if (!hasDescription) {
                                    alert("תיאור הוא שדה חובה");
                                    return;
                                  }
                                  try {
                                    await downloadPdf({
                                      documentId: receipt.id,
                                      issue: "copy",
                                      lang: "en",
                                      fileName: `receipt-${receipt.document_number || receipt.id}-copy-en.pdf`,
                                    })
                                  } catch (error: any) {
                                    alert(`שגיאה בהורדת PDF: ${error.message}`);
                                  }
                                }}
                                disabled={!hasDescription}
                                variant="secondary"
                                style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                                title={!hasDescription ? "תיאור הוא שדה חובה" : undefined}
                              >
                                English copy
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ borderTop: '2px solid #FFFFFF', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#708993', fontSize: '16px' }}>
                עמוד {page} מתוך {totalPages}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  variant="secondary"
                  style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                >
                  הקודם
                </Button>

                <Button
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  variant="secondary"
                  style={{ height: '40px', fontSize: '16px', borderColor: '#1A8299', color: '#1A8299' }}
                >
                  הבא
                </Button>
              </div>
            </div>
          )}
        </FormSection>
      </div>
    </div>
  );
}
