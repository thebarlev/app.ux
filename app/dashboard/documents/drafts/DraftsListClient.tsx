"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen } from "lucide-react";
import { getAllDocumentConfigs } from "@/lib/documents/document-configs";
import type { DocumentsListFilters, DocumentsListResult } from "../actions";
import { currencySymbol } from "@/lib/currency/symbol";

const DOCUMENT_CONFIGS_BY_DB = new Map(
  getAllDocumentConfigs().map((config) => [config.dbValue, config])
);

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
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${
    currencySymbol(curr)
  }`;
}

function getDocumentTypeLabel(type: string): string {
  const config = DOCUMENT_CONFIGS_BY_DB.get(type);
  return config?.label || type;
}

function truncateDescription(description: string | null): string {
  if (!description || description.trim() === "") {
    return "—";
  }
  const trimmed = description.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return trimmed.substring(0, 12) + " ...";
}

export default function DraftsListClient({ initialData }: Props) {
  const router = useRouter();
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  if (!initialData.ok) {
    return (
      <div className="ui-alert-danger">
        <div className="font-bold">שגיאה</div>
        <div className="mt-2">{initialData.message}</div>
      </div>
    );
  }

  const { documents } = initialData.data!;

  const tableFontSize = "clamp(12px,1.2vw, 16px)";
  const tableHeaderColor = "#5389BB";
  const tableHeaderBorder = "1px solid #EDF1F5";

  function getDraftOpenHref(docType: string, draftId: string) {
    const t = String(docType || "").toLowerCase();
    if (t === "receipt") return `/dashboard/documents/receipt?draftId=${encodeURIComponent(draftId)}`;
    if (t === "tax_invoice") return `/dashboard/documents/tax-invoice?draftId=${encodeURIComponent(draftId)}`;
    if (t === "invoice_receipt") return `/dashboard/documents/tax-invoice-receipt?draftId=${encodeURIComponent(draftId)}`;
    if (t === "credit_note") return `/dashboard/documents/credit-note?draftId=${encodeURIComponent(draftId)}`;

    // Business document types live under /business/documents/new/{uiKey}
    const businessUiKeyByDb: Record<string, string> = {
      quote: "quote",
      proforma: "proforma",
      work_order: "workOrder",
      delivery_note: "deliveryNote",
      return_note: "returnNote",
      purchase_order: "purchaseOrder",
      self_invoice: "selfInvoice",
      self_credit_note: "selfCreditNote",
    };
    const uiKey = businessUiKeyByDb[t];
    if (uiKey) return `/business/documents/new/${uiKey}?draftId=${encodeURIComponent(draftId)}`;

    return null;
  }

  const monthGroups = useMemo(() => {
    const safeDate = (doc: any) => {
      const s = doc?.document_date || doc?.created_at;
      const d = s ? new Date(s) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    };

    const sorted = [...documents].sort((a, b) => {
      const da = safeDate(a);
      const db = safeDate(b);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      return tb - ta;
    });

    const groups: Array<{ key: string; label: string; docs: typeof documents }> = [];
    const fmt = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });

    for (const doc of sorted) {
      const d = safeDate(doc);
      const y = d ? d.getFullYear() : 0;
      const m = d ? d.getMonth() : 0;
      const key = `${y}-${m}`;
      const label = d ? fmt.format(d) : "ללא תאריך";

      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label, docs: [doc] });
      } else {
        last.docs.push(doc);
      }
    }

    return groups;
  }, [documents]);

  return (
    <div className="mt-[50px]">
      <FormSection title="טיוטות">
        <div className="docs-table-scroll">
          {/* Column headers (single header row for the whole list) */}
          <table
            style={{
              width: "100%",
              minWidth: "900px",
              borderCollapse: "collapse",
              fontSize: tableFontSize,
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              {/* date */}
              <col style={{ width: "clamp(90px, 10vw, 80px)" }} />
              {/* doc type */}
              <col style={{ width: "clamp(150px, 9vw, 120px)" }} />
              {/* customer */}
              <col style={{ width: "clamp(190px, 16vw, 60px)" }} />
              {/* description */}
              <col style={{ width: "clamp(211px, 30vw, 210px)" }} />
              {/* amount */}
              <col style={{ width: "clamp(50px, 10vw, 140px)" }} />
              {/* actions */}
              <col style={{ width: "260px" }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: "#FFFFFF", borderBottom: tableHeaderBorder }}>
                <th style={{ padding: "5px 4px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תאריך</th>
                <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סוג המסמך</th>
                <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>שם הלקוח</th>
                <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תיאור</th>
                <th style={{ padding: "5px 4px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סכום</th>
                <th className="docs-actions-cell" style={{ padding: "6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>
                  <span className="docs-actions-shift">פעולות</span>
                </th>
              </tr>
            </thead>
          </table>

          {documents.length === 0 ? (
            <Card className="mt-4">
              <CardContent className="p-8 text-center">
                <p style={{ fontSize: "18px", color: "#708993" }}>לא נמצאו טיוטות</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {monthGroups.map((group) => (
                <div key={group.key} style={{ backgroundColor: "#FFFFFF" }}>
                  <div style={{ padding: "18px 20px 10px 20px" }}>
                    <h4 className="text-right text-base font-semibold" style={{ color: "#19183B", margin: 0 }}>
                      {group.label}
                    </h4>
                  </div>

                  <table
                    style={{
                      width: "100%",
                      minWidth: "900px",
                      borderCollapse: "collapse",
                      fontSize: tableFontSize,
                      tableLayout: "fixed",
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "clamp(90px, 10vw, 80px)" }} />
                      <col style={{ width: "clamp(150px, 9vw, 120px)" }} />
                      <col style={{ width: "clamp(190px, 16vw, 60px)" }} />
                      <col style={{ width: "clamp(211px, 30vw, 210px)" }} />
                      <col style={{ width: "clamp(50px, 10vw, 140px)" }} />
                      <col style={{ width: "260px" }} />
                    </colgroup>
                    <tbody>
                      {group.docs.map((doc, index) => (
                        <tr
                          key={doc.id}
                          style={{
                            backgroundColor: index % 2 === 0 ? "#FFFFFF" : "#EDF1F5",
                            borderBottom: "1px solid #EDF1F5",
                            position: "relative",
                          }}
                          onMouseEnter={() => setHoveredRowId(doc.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                        >
                          <td style={{ padding: "10px 8px", textAlign: "right", fontSize: tableFontSize, color: "#19183B", whiteSpace: "nowrap" }}>
                            {formatDate(doc.document_date)}
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, color: "#19183B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <span title={getDocumentTypeLabel(doc.document_type)}>{getDocumentTypeLabel(doc.document_type)}</span>
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, color: "#19183B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {doc.customer_name || "—"}
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, color: "#19183B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <span title={doc.document_description || ""}>{truncateDescription(doc.document_description)}</span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", fontSize: tableFontSize, color: "#19183B", whiteSpace: "nowrap" }}>
                            {formatAmount(doc.total_amount, doc.currency)}
                          </td>
                          <td style={{ padding: "12px", textAlign: "right", position: "relative" }} onClick={(e) => e.stopPropagation()}>
                            {hoveredRowId === doc.id ? (
                              <div className="flex items-center justify-end gap-2" style={{ marginBottom: 6 }}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="פתיחה"
                                  onClick={() => {
                                    const href = getDraftOpenHref(doc.document_type, doc.id);
                                    if (!href) return;
                                    router.push(href);
                                  }}
                                >
                                  <FolderOpen className="h-5 w-5" />
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </FormSection>
    </div>
  );
}

