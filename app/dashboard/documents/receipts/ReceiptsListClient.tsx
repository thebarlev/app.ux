"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReceiptsListFilters, ReceiptsListResult } from "./actions";
import { exportReceiptsCSVAction, getReceiptPreviewUrlAction } from "./actions";

type Props = {
  initialData: { ok: boolean; data?: ReceiptsListResult; message?: string };
  initialFilters: ReceiptsListFilters;
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

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case "draft":
      return { background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24" };
    case "final":
      return { background: "#d1fae5", color: "#065f46", border: "1px solid #10b981" };
    case "void":
    case "cancelled":
      return { background: "#fee2e2", color: "#991b1b", border: "1px solid #ef4444" };
    default:
      return { background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" };
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

export default function ReceiptsListClient({ initialData, initialFilters }: Props) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState(initialFilters.search || "");
  const [status, setStatus] = useState(initialFilters.status || "all");
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialFilters.dateTo || "");

  if (!initialData.ok) {
    return (
      <div style={{ padding: 16, border: "1px solid #fca5a5", borderRadius: 12, background: "#fff1f2" }}>
        <div style={{ fontWeight: 800 }}>שגיאה</div>
        <div style={{ marginTop: 8 }}>{initialData.message}</div>
      </div>
    );
  }

  const { receipts, totalCount, page, pageSize } = initialData.data!;
  const totalPages = Math.ceil(totalCount / pageSize);

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", "1");

    router.push(`/dashboard/documents/receipts?${params.toString()}`);
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
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
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", newPage.toString());

    router.push(`/dashboard/documents/receipts?${params.toString()}`);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>קבלות</h1>
          <p style={{ marginTop: 6, opacity: 0.75, margin: 0 }}>
            {totalCount} קבלות סה״כ
          </p>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: exporting ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {exporting ? "מייצא..." : "ייצוא CSV"}
          </button>

          <Link
            href="/dashboard/documents/receipt"
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            קבלה חדשה +
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "white",
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>סינון</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>חיפוש חופשי</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="מספר, לקוח, תיאור..."
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>סטטוס</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | "draft" | "final" | "void")}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value="all">הכל</option>
              <option value="draft">טיוטות בלבד</option>
              <option value="final">הופקו בלבד</option>
              <option value="void">מבוטלים</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מתאריך</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>עד תאריך</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={applyFilters}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            החל סינון
          </button>

          <button
            onClick={resetFilters}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            איפוס
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, background: "white", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>מספר קבלה</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>תאריך</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>לקוח</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>תיאור</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>סכום</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>סטטוס</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>פעולות</th>
              </tr>
            </thead>

            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 48 }}>📭</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: "#374151" }}>
                        {search || status !== "all" || dateFrom || dateTo 
                          ? "לא נמצאו קבלות התואמות את החיפוש"
                          : "עדיין לא יצרת קבלות"
                        }
                      </div>
                      {!search && status === "all" && !dateFrom && !dateTo && (
                        <div style={{ marginTop: 8 }}>
                          <Link
                            href="/dashboard/documents/receipt"
                            style={{
                              padding: "10px 20px",
                              background: "#10b981",
                              color: "white",
                              borderRadius: 8,
                              textDecoration: "none",
                              fontWeight: 600,
                              display: "inline-flex",
                              gap: 8,
                              alignItems: "center"
                            }}
                          >
                            ➕ צור קבלה ראשונה
                          </Link>
                        </div>
                      )}
                      {(search || status !== "all" || dateFrom || dateTo) && (
                        <button
                          onClick={resetFilters}
                          style={{
                            padding: "8px 16px",
                            background: "#f3f4f6",
                            color: "#374151",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            cursor: "pointer",
                            fontWeight: 600,
                            marginTop: 8
                          }}
                        >
                          נקה סינונים
                        </button>
                      )}
                      <div style={{ marginTop: 12, fontSize: 14, opacity: 0.6 }}>
                        <Link href="/dashboard/debug-receipts" style={{ color: "#3b82f6", textDecoration: "underline" }}>
                          🔍 עמוד Debug - בדוק מדוע אין קבלות
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => (
                  <tr key={receipt.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 16, fontWeight: 600 }}>
                      {receipt.status === "draft" ? (
                        <span style={{ opacity: 0.5, fontWeight: 400, fontSize: 12 }}>טיוטה</span>
                      ) : (
                        receipt.document_number || (
                          <span style={{ opacity: 0.5, fontWeight: 400 }}>—</span>
                        )
                      )}
                    </td>
                    <td style={{ padding: 16 }}>{formatDate(receipt.document_date)}</td>
                    <td style={{ padding: 16 }}>{receipt.customer_name}</td>
                    <td style={{ padding: 16, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {receipt.description || (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 16, fontWeight: 600 }}>
                      {formatAmount(receipt.amount, receipt.currency)}
                    </td>
                    <td style={{ padding: 16 }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          ...getStatusBadgeStyle(receipt.status),
                        }}
                      >
                        {getStatusLabel(receipt.status)}
                      </span>
                    </td>
                    <td style={{ padding: 16 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {receipt.status === "draft" ? (
                          <Link
                            href={`/dashboard/documents/receipt?draftId=${receipt.id}`}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: "white",
                              cursor: "pointer",
                              fontSize: 14,
                              fontWeight: 600,
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            עריכה
                          </Link>
                        ) : (
                          <>
                            <button
                              onClick={async () => {
                                const result = await getReceiptPreviewUrlAction(receipt.id);
                                if (result.ok && result.url) {
                                  window.open(result.url, "_blank");
                                } else {
                                  alert(result.message || "Failed to open preview");
                                }
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: "1px solid #10b981",
                                background: "#10b981",
                                cursor: "pointer",
                                fontSize: 14,
                                fontWeight: 600,
                                color: "white",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              👁 צפייה
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const pdfUrl = `/api/receipts/${receipt.id}/pdf`;
                                  console.log("Downloading PDF from:", pdfUrl);
                                  
                                  // Fetch PDF as binary data
                                  const response = await fetch(pdfUrl);
                                  
                                  if (!response.ok) {
                                    throw new Error(`PDF download failed: ${response.statusText}`);
                                  }
                                  
                                  // Get the binary data as a Blob
                                  const blob = await response.blob();
                                  console.log("PDF blob size:", blob.size, "type:", blob.type);
                                  
                                  if (blob.size === 0) {
                                    throw new Error("Downloaded PDF is empty");
                                  }
                                  
                                  // Create a proper Blob with correct MIME type
                                  const pdfBlob = new Blob([blob], { type: "application/pdf" });
                                  
                                  // Create download link
                                  const downloadUrl = window.URL.createObjectURL(pdfBlob);
                                  const link = document.createElement("a");
                                  link.href = downloadUrl;
                                  link.download = `receipt-${receipt.document_number}.pdf`;
                                  document.body.appendChild(link);
                                  link.click();
                                  
                                  // Cleanup
                                  document.body.removeChild(link);
                                  window.URL.revokeObjectURL(downloadUrl);
                                  
                                  console.log("PDF download completed");
                                } catch (error: any) {
                                  console.error("PDF download error:", error);
                                  alert(`שגיאה בהורדת PDF: ${error.message}`);
                                }
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: "1px solid #3b82f6",
                                background: "#3b82f6",
                                cursor: "pointer",
                                fontSize: 14,
                                fontWeight: 600,
                                color: "white",
                              }}
                            >
                              📥 PDF
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              padding: 16,
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ opacity: 0.75 }}>
              עמוד {page} מתוך {totalPages}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: page === 1 ? "#f3f4f6" : "white",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                הקודם
              </button>

              <button
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: page === totalPages ? "#f3f4f6" : "white",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                הבא
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
