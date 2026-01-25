"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCreditNotePreviewUrlAction } from "@/app/dashboard/documents/credit-note/actions";
import { Download, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CreditNoteRow = {
  id: string;
  document_number: string | null;
  document_type: string;
  issue_date: string | null;
  created_at: string | null;
  customer_name: string | null;
  document_description: string | null;
  subtotal?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  total_amount: number | null;
  currency: string | null;
  document_status: string;
  language?: "he" | "en" | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
};

type CompanyRow = {
  company_name?: string | null;
  registration_number?: string | null;
  company_number?: string | null;
  email?: string | null;
} | null;

type CustomerRow = {
  name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  mobile?: string | null;
} | null;

type ItemRow = {
  label: string | null;
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
  vatMode: "before" | "included" | null;
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("he-IL");
  } catch {
    return "—";
  }
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || typeof amount !== "number") return "—";
  const curr = currency || "ILS";
  const formatted = amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${curr === "ILS" ? "₪" : curr}`;
}

async function downloadPdf(documentId: string, opts: { issue: "original" | "copy"; lang: "he" | "en"; fileName: string }) {
  const url = `/api/documents/${documentId}/pdf?issue=${opts.issue}&lang=${opts.lang}`;
  const res = await fetch(url);
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const message = (json && (json.message || json.details || json.error)) || res.statusText;
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("Downloaded PDF is empty");
  const pdfBlob = new Blob([blob], { type: "application/pdf" });
  const downloadUrl = window.URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = opts.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

type ItemLineItemRow = {
  label: string | null;
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
  vatMode: "before" | "included" | null;
};

function formatVatMode(value: ItemRow["vatMode"]): string {
  if (value === "included") return "כולל";
  if (value === "before") return "לפני";
  return "—";
}

export default function CreditNoteSummaryClient(props: {
  creditNote: CreditNoteRow;
  company: CompanyRow;
  customer: CustomerRow;
  items: ItemRow[];
}) {
  const [busy, setBusy] = useState<null | "view" | "download">(null);
  const [itemsState, setItemsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message?: string;
    items?: ItemLineItemRow[];
  }>({ status: "idle" });

  const title = useMemo(() => {
    const n = props.creditNote.document_number || "—";
    return `חשבונית זיכוי ${n}`;
  }, [props.creditNote.document_number]);

  const documentDescription = useMemo(() => {
    const desc = typeof props.creditNote.document_description === "string" ? props.creditNote.document_description.trim() : "";
    return desc.length ? desc : null;
  }, [props.creditNote.document_description]);

  const notes = useMemo(() => {
    const a = typeof props.creditNote.customer_notes === "string" ? props.creditNote.customer_notes.trim() : "";
    const b = typeof props.creditNote.internal_notes === "string" ? props.creditNote.internal_notes.trim() : "";
    const combined = [a, b].filter(Boolean).join("\n");
    return combined.length ? combined : null;
  }, [props.creditNote.customer_notes, props.creditNote.internal_notes]);

  useEffect(() => {
    let cancelled = false;
    setItemsState({ status: "loading" });
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("document_line_items")
          .select("description, line_total, unit_price, quantity, currency, payment_metadata")
          .eq("document_id", props.creditNote.id)
          .order("line_number", { ascending: true });
        if (error) throw error;
        if (cancelled) return;

        const items: ItemLineItemRow[] = (data || []).map((item: any) => {
          const meta = item?.payment_metadata || {};
          return {
            label: typeof meta?.label === "string" ? meta.label : typeof item?.description === "string" ? item.description : null,
            sku: typeof meta?.sku === "string" ? meta.sku : null,
            description: typeof meta?.details === "string" ? meta.details : typeof item?.description === "string" ? item.description : null,
            quantity: typeof item?.quantity === "number" ? item.quantity : null,
            unitPrice: typeof item?.unit_price === "number" ? item.unit_price : null,
            lineTotal: typeof item?.line_total === "number" ? item.line_total : typeof item?.unit_price === "number" ? item.unit_price : null,
            currency: typeof item?.currency === "string" ? item.currency : null,
            vatMode: typeof meta?.vatMode === "string" ? meta.vatMode : null,
          };
        });

        setItemsState({ status: "ready", items });
      } catch (e: any) {
        if (cancelled) return;
        setItemsState({ status: "error", message: e?.message || "שגיאה בטעינת הפריטים" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.creditNote.id]);

  const itemsToShow: ItemRow[] = useMemo(() => {
    if (itemsState.status === "ready" && itemsState.items) {
      return itemsState.items;
    }
    return props.items || [];
  }, [itemsState.status, itemsState.items, props.items]);

  const isEnglishDocument = props.creditNote.language === "en";
  const vatRate = typeof props.creditNote.vat_rate === "number" ? props.creditNote.vat_rate : 0;
  const vatAmount = typeof props.creditNote.vat_amount === "number" ? props.creditNote.vat_amount : 0;
  const subtotal =
    typeof props.creditNote.subtotal === "number"
      ? props.creditNote.subtotal
      : vatRate > 0 && typeof props.creditNote.total_amount === "number"
        ? Number((props.creditNote.total_amount - vatAmount).toFixed(2))
        : props.creditNote.total_amount || 0;

  async function openFullPreview() {
    setBusy("view");
    try {
      const res = await getCreditNotePreviewUrlAction(props.creditNote.id);
      if (res.ok && res.url) {
        window.open(res.url, "_blank");
        return;
      }
      alert(res.message || "שגיאה בפתיחת תצוגה");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10 pb-10">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-right">{title}</h1>

              <div className="flex items-center gap-2">
                {isEnglishDocument ? (
                  <>
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="הורדה (עברית)"
                        onClick={async () => {
                          if (busy !== null) return;
                          setBusy("download");
                          try {
                            await downloadPdf(props.creditNote.id, {
                              issue: "copy",
                              lang: "he",
                              fileName: `${props.creditNote.document_number || props.creditNote.id}-he.pdf`,
                            });
                          } catch (e: any) {
                            alert(e?.message || "שגיאה בהורדה");
                          } finally {
                            setBusy(null);
                          }
                        }}
                        disabled={busy !== null}
                      >
                        <Download className="h-5 w-5" />
                      </Button>
                      <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                          הורדת העתק (עברית)
                        </div>
                      </div>
                    </div>

                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="הורדה (אנגלית)"
                        onClick={async () => {
                          if (busy !== null) return;
                          setBusy("download");
                          try {
                            await downloadPdf(props.creditNote.id, {
                              issue: "copy",
                              lang: "en",
                              fileName: `${props.creditNote.document_number || props.creditNote.id}-en.pdf`,
                            });
                          } catch (e: any) {
                            alert(e?.message || "שגיאה בהורדה");
                          } finally {
                            setBusy(null);
                          }
                        }}
                        disabled={busy !== null}
                      >
                        <Download className="h-5 w-5" />
                      </Button>
                      <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                          הורדת העתק (אנגלית)
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative group">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="הורדה"
                      onClick={async () => {
                        if (busy !== null) return;
                        setBusy("download");
                        try {
                          await downloadPdf(props.creditNote.id, {
                            issue: "copy",
                            lang: "he",
                            fileName: `${props.creditNote.document_number || props.creditNote.id}-he.pdf`,
                          });
                        } catch (e: any) {
                          alert(e?.message || "שגיאה בהורדה");
                        } finally {
                          setBusy(null);
                        }
                      }}
                      disabled={busy !== null}
                    >
                      <Download className="h-5 w-5" />
                    </Button>
                    <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                        הורדה
                      </div>
                    </div>
                  </div>
                )}

                <div className="relative group">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="צפייה במסמך"
                    onClick={openFullPreview}
                    disabled={busy !== null}
                  >
                    <Eye className="h-5 w-5" />
                  </Button>
                  <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                      צפייה במסמך
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-right text-muted-foreground" style={{ fontSize: "16px" }}>
              <span>תאריך מסמך: {formatDate(props.creditNote.issue_date)}</span>
              {props.creditNote.created_at ? <span> | הופק ב- {formatDateTime(props.creditNote.created_at)}</span> : null}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <h4 className="text-right text-base font-semibold">סכום מסמך</h4>
              </CardHeader>
              <CardContent className="pr-0 text-right text-2xl font-bold">
                {formatAmount(props.creditNote.total_amount, props.creditNote.currency)}
                <div className="mt-2 space-y-1 text-sm font-normal text-muted-foreground">
                  <div className="flex justify-between">
                    <span>סכום לפני מע״מ</span>
                    <span>{formatAmount(subtotal, props.creditNote.currency)}</span>
                  </div>
                  {vatRate > 0 ? (
                    <div className="flex justify-between">
                      <span>מע״מ ({vatRate}%)</span>
                      <span>{formatAmount(vatAmount, props.creditNote.currency)}</span>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h4 className="text-right text-base font-semibold">פרטי העסק</h4>
              </CardHeader>
              <CardContent className="pr-0 text-right text-sm">
                <div className="font-semibold">{props.company?.company_name || "—"}</div>
                <div className="mt-2 text-muted-foreground">
                  <div>
                    {props.company?.registration_number || props.company?.company_number ? (
                      <span>ח.פ/עוסק: {props.company?.registration_number || props.company?.company_number}</span>
                    ) : (
                      <span>ח.פ/עוסק: —</span>
                    )}
                  </div>
                  {props.company?.email ? <div className="mt-1">אימייל: {props.company.email}</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h4 className="text-right text-base font-semibold">פרטי הלקוח</h4>
              </CardHeader>
              <CardContent className="pr-0 text-right text-sm">
                <div className="font-semibold">{props.customer?.name || props.creditNote.customer_name || "—"}</div>
                <div className="mt-2 text-muted-foreground">
                  {props.customer?.tax_id ? <div>מס׳ עוסק/ת.ז: {props.customer.tax_id}</div> : null}
                  {props.customer?.mobile || props.customer?.phone ? (
                    <div className="mt-1">טל׳: {props.customer.mobile || props.customer.phone}</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {documentDescription ? (
            <div className="mt-6">
              <h4 className="text-right text-base font-semibold mb-2">תיאור</h4>
              <Card>
                <CardContent className="p-4 pr-0 text-right whitespace-pre-wrap">{documentDescription}</CardContent>
              </Card>
            </div>
          ) : null}

          <div className="mt-6">
            <h4 className="text-right text-base font-semibold mb-2">רשימת פריטים</h4>
            {itemsState.status === "loading" ? (
              <div className="text-right text-sm text-muted-foreground mb-2">טוען הפריטים…</div>
            ) : itemsState.status === "error" ? (
              <div className="ui-alert-danger mb-2">
                <div className="font-bold">שגיאה</div>
                <div className="mt-2">{itemsState.message}</div>
              </div>
            ) : null}

            <Card>
              <CardContent className="!p-0">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #EDF1F5" }}>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993" }}>
                          לייבל
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993" }}>
                          מק״ט
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993" }}>
                          פירוט
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          כמות
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          מחיר ליחידה
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          מטבע
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          מע״מ
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          סה״כ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsToShow.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "20px 0", textAlign: "center", color: "#708993" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        itemsToShow.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #EDF1F5" }}>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {item.label || "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {item.sku || "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B" }}>
                              {item.description || "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {item.quantity ?? "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {formatAmount(item.unitPrice, item.currency || props.creditNote.currency)}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {item.currency || props.creditNote.currency || "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {formatVatMode(item.vatMode)}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {formatAmount(item.lineTotal, item.currency || props.creditNote.currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {notes ? (
            <div className="mt-6">
              <h4 className="text-right text-base font-semibold mb-2">הערות</h4>
              <Card>
                <CardContent className="p-4 pr-0 text-right whitespace-pre-wrap">{notes}</CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
