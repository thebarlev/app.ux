"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReceiptPreviewUrlAction } from "@/app/dashboard/documents/receipt/actions";
import { Download, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ReceiptRow = {
  id: string;
  document_number: string | null;
  document_type: string;
  issue_date: string | null;
  created_at: string | null;
  customer_name: string | null;
  document_description: string | null;
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

type PaymentRow = {
  method: string | null;
  details: string | string[] | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
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

type PaymentLineItemRow = {
  method: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  details: string[]; // already-filtered, display-ready lines
};

function normalizeValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s.length ? s : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== "{}" && json !== "[]" ? json : null;
  } catch {
    return String(value);
  }
}

function stringifyPaymentDetails(input: any): string[] {
  const lines: string[] = [];

  // Known direct fields (if present)
  const bankName = normalizeValue(input?.bank_name);
  const branch = normalizeValue(input?.branch);
  const accountNumber = normalizeValue(input?.account_number);

  if (bankName) lines.push(`בנק: ${bankName}`);
  if (branch) lines.push(`סניף: ${branch}`);
  if (accountNumber) lines.push(`חשבון: ${accountNumber}`);

  const meta = input?.payment_metadata || {};
  const seenKeys = new Set<string>();
  const add = (label: string, key: string, value: any) => {
    const s = normalizeValue(value);
    if (!s) return;
    seenKeys.add(key);
    lines.push(`${label}: ${s}`);
  };

  // Common metadata fields (from existing receipt mapping)
  add("פירוט", "description", meta.description);
  add("אסמכתא", "transactionReference", meta.transactionReference);
  add("חשבון משלם", "payerAccount", meta.payerAccount);

  add("סוג כרטיס", "cardType", meta.cardType);
  add("ספרות אחרונות", "cardLastDigits", meta.cardLastDigits);
  add("סוג עסקה", "cardDealType", meta.cardDealType);
  add("תשלומים", "cardInstallments", meta.cardInstallments);

  add("בנק צ׳ק", "checkBank", meta.checkBank);
  add("סניף צ׳ק", "checkBranch", meta.checkBranch);
  add("חשבון צ׳ק", "checkAccount", meta.checkAccount);
  add("מס׳ צ׳ק", "checkNumber", meta.checkNumber);

  add("reference", "reference", meta.reference);
  add("reference_number", "reference_number", meta.reference_number);
  add("הערות", "notes", meta.notes);

  // Include any additional metadata fields the user filled (no inventing; show raw key)
  if (meta && typeof meta === "object") {
    Object.keys(meta).forEach((k) => {
      if (seenKeys.has(k)) return;
      const v = (meta as any)[k];
      const s = normalizeValue(v);
      if (!s) return;
      lines.push(`${k}: ${s}`);
    });
  }

  return lines;
}

function formatDetailsInline(details: string | string[] | null | undefined): string {
  if (!details) return "—";
  if (typeof details === "string") {
    const s = details.trim();
    return s.length ? s : "—";
  }

  const values = (details || [])
    .map((line) => {
      const s = typeof line === "string" ? line.trim() : "";
      if (!s) return "";
      const idx = s.indexOf(":");
      return (idx >= 0 ? s.slice(idx + 1) : s).trim();
    })
    .filter(Boolean);

  return values.length ? values.join(", ") : "—";
}

export default function ReceiptSummaryClient(props: {
  receipt: ReceiptRow;
  company: CompanyRow;
  customer: CustomerRow;
  payments: PaymentRow[];
}) {
  const [busy, setBusy] = useState<null | "view" | "download">(null);
  const [paymentsState, setPaymentsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message?: string;
    payments?: PaymentLineItemRow[];
  }>({ status: "idle" });

  const title = useMemo(() => {
    const n = props.receipt.document_number || "—";
    return `קבלה ${n}`;
  }, [props.receipt.document_number]);

  const documentDescription = useMemo(() => {
    const desc = typeof props.receipt.document_description === "string" ? props.receipt.document_description.trim() : "";
    return desc.length ? desc : null;
  }, [props.receipt.document_description]);

  const notes = useMemo(() => {
    const a = typeof props.receipt.customer_notes === "string" ? props.receipt.customer_notes.trim() : "";
    const b = typeof props.receipt.internal_notes === "string" ? props.receipt.internal_notes.trim() : "";
    const combined = [a, b].filter(Boolean).join("\n");
    return combined.length ? combined : null;
  }, [props.receipt.customer_notes, props.receipt.internal_notes]);

  useEffect(() => {
    let cancelled = false;
    setPaymentsState({ status: "loading" });
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("document_line_items")
          .select("description, item_date, line_total, unit_price, currency, bank_name, branch, account_number, payment_metadata")
          .eq("document_id", props.receipt.id)
          .order("line_number", { ascending: true });
        if (error) throw error;
        if (cancelled) return;

        const payments: PaymentLineItemRow[] = (data || []).map((item: any) => {
          const method = typeof item?.description === "string" ? item.description : null;
          const date = typeof item?.item_date === "string" ? item.item_date : null;
          const amount =
            typeof item?.line_total === "number" ? item.line_total : typeof item?.unit_price === "number" ? item.unit_price : null;
          const currency = typeof item?.currency === "string" ? item.currency : null;
          const details = stringifyPaymentDetails(item);
          return { method, date, amount, currency, details };
        });

        setPaymentsState({ status: "ready", payments });
      } catch (e: any) {
        if (cancelled) return;
        setPaymentsState({ status: "error", message: e?.message || "שגיאה בטעינת התקבולים" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.receipt.id]);

  const paymentsToShow: PaymentRow[] = useMemo(() => {
    if (paymentsState.status === "ready" && paymentsState.payments) {
      return paymentsState.payments;
    }
    return props.payments || [];
  }, [paymentsState.status, paymentsState.payments, props.payments]);

  const isEnglishDocument = props.receipt.language === "en";

  async function openFullPreview() {
    setBusy("view");
    try {
      const res = await getReceiptPreviewUrlAction(props.receipt.id);
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
                            await downloadPdf(props.receipt.id, {
                              issue: "copy",
                              lang: "he",
                              fileName: `${props.receipt.document_number || props.receipt.id}-he.pdf`,
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
                            await downloadPdf(props.receipt.id, {
                              issue: "copy",
                              lang: "en",
                              fileName: `${props.receipt.document_number || props.receipt.id}-en.pdf`,
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
                          await downloadPdf(props.receipt.id, {
                            issue: "copy",
                            lang: "he",
                            fileName: `${props.receipt.document_number || props.receipt.id}-he.pdf`,
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
              <span>תאריך מסמך: {formatDate(props.receipt.issue_date)}</span>
              {props.receipt.created_at ? <span> | הופק ב- {formatDateTime(props.receipt.created_at)}</span> : null}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <h4 className="text-right text-base font-semibold">סכום מסמך</h4>
              </CardHeader>
              <CardContent className="pr-0 text-right text-2xl font-bold">
                {formatAmount(props.receipt.total_amount, props.receipt.currency)}
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
                <div className="font-semibold">{props.customer?.name || props.receipt.customer_name || "—"}</div>
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
            <h4 className="text-right text-base font-semibold mb-2">פרטי תשלומים</h4>
            {paymentsState.status === "loading" ? (
              <div className="text-right text-sm text-muted-foreground mb-2">טוען התקבולים…</div>
            ) : paymentsState.status === "error" ? (
              <div className="ui-alert-danger mb-2">
                <div className="font-bold">שגיאה</div>
                <div className="mt-2">{paymentsState.message}</div>
              </div>
            ) : null}

            <Card>
              <CardContent className="!p-0">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #EDF1F5" }}>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993" }}>
                          אמצעי תשלום
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993" }}>
                          פירוט
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          תאריך
                        </th>
                        <th style={{ padding: "12px 0", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#708993", whiteSpace: "nowrap" }}>
                          סכום
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsToShow.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: "20px 0", textAlign: "center", color: "#708993" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        paymentsToShow.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #EDF1F5" }}>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {p.method || "—"}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B" }}>
                              <span className="text-sm text-muted-foreground">
                                {formatDetailsInline(p.details)}
                              </span>
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", whiteSpace: "nowrap" }}>
                              {formatDate(p.date)}
                            </td>
                            <td style={{ padding: "14px 0", textAlign: "right", color: "#19183B", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {formatAmount(p.amount, p.currency || props.receipt.currency)}
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

