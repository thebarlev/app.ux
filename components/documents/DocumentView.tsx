"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Download, ArrowRight } from "lucide-react";
import { getAllDocumentConfigs } from "@/lib/documents/document-configs";
import { currencySymbol } from "@/lib/currency/symbol";
import { downloadDocumentPdf } from "@/lib/documents/download-pdf";

/**
 * Document view — the destination behind /dashboard/documents/[id].
 *
 * Was DocumentsQuickViewDrawer, a floating Sheet opened from the documents list.
 * It renders real content (line items, linked documents), which makes it a place
 * you navigate INTO, so it is now a page: it has a URL, back works, and it can be
 * refreshed or shared. Same content, same queries — only the Sheet chrome is gone.
 */

const DOCUMENT_CONFIGS_BY_DB = new Map(
  getAllDocumentConfigs().map((config) => [config.dbValue, config])
);

const ITEM_DOCUMENT_TYPES = new Set(
  getAllDocumentConfigs().map((config) => config.dbValue)
);

export type DocumentViewSnapshot = {
  id: string;
  document_number: string | null;
  document_type: string;
  document_date: string | null;
  customer_id?: string | null;
  customer_name: string | null;
  document_description: string | null;
  payment_method: string | null;
  total_amount: number | null;
  currency: string | null;
  document_status: string;
  accounting_status?: string | null;
  outstanding_balance?: number | null;
  reference_text?: string | null;
  created_at: string;
};

type PaymentLine = {
  method: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  details: string | null;
};

type LinkDocLite = {
  id: string;
  document_type: string;
  document_number: string | null;
  issue_date: string | null;
  document_status: string;
};

type DocumentLinkLine = {
  id: string;
  link_type: string;
  amount: number;
  note: string | null;
  created_at: string;
  source: LinkDocLite | null;
  target: LinkDocLite | null;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || typeof amount !== "number") return "—";
  const curr = currency || "ILS";
  const formatted = amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${currencySymbol(curr)}`;
}

function getDocumentTypeLabel(type: string): string {
  const config = DOCUMENT_CONFIGS_BY_DB.get(type);
  return config?.label || type;
}

function formatLinkType(t: string): string {
  const s = String(t || "").toLowerCase();
  if (s === "payment") return "תשלום";
  if (s === "credit") return "זיכוי";
  if (s === "cancellation") return "ביטול";
  if (s === "conversion") return "המרה";
  if (s === "related") return "שיוך";
  return t || "שיוך";
}

type UIStatus = "open" | "closed" | "canceling" | "canceled";

function computeUiStatusFromDocAndLinks(params: {
  doc: DocumentViewSnapshot | null;
  links: DocumentLinkLine[] | null;
}): UIStatus {
  const { doc, links } = params;
  const ds = String(doc?.document_status || "").toLowerCase();
  const isDocCanceled = ds === "canceled" || ds === "cancelled" || ds === "void";

  const total = typeof doc?.total_amount === "number" ? doc.total_amount : doc?.total_amount ? Number(doc.total_amount) : null;
  const outstanding =
    typeof doc?.outstanding_balance === "number"
      ? doc.outstanding_balance
      : doc?.outstanding_balance
        ? Number(doc.outstanding_balance)
        : null;

  const incomingCreditSum = (links || []).reduce((acc, l) => {
    if (l.link_type !== "credit" && l.link_type !== "cancellation") return acc;
    if (l.target?.id !== doc?.id) return acc;
    const n = Number(l.amount || 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const isCanceledByCredit = !!(total && total > 0 && incomingCreditSum >= total);

  const hasOutgoingCreditLink = (links || []).some(
    (l) => (l.link_type === "credit" || l.link_type === "cancellation") && l.source?.id === doc?.id
  );
  const isCanceling = String(doc?.document_type || "").toLowerCase() === "credit_note" || hasOutgoingCreditLink;

  const isFinal = ds === "final";

  if (isDocCanceled || isCanceledByCredit) return "canceled";
  if (isCanceling) return "canceling";

  if (typeof outstanding === "number" && Number.isFinite(outstanding)) {
    return outstanding <= 0 ? "closed" : "open";
  }

  if (isFinal) return "closed";
  if (typeof total === "number" && total === 0) return "closed";
  return "open";
}

function getStatusBadgeFromUi(status: UIStatus): { label: string; style: React.CSSProperties } {
  switch (status) {
    case "open":
      return { label: "פתוח", style: { backgroundColor: "#E8F2FF", color: "#1D4ED8" } };
    case "closed":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } };
    case "canceling":
      return { label: "מבטל", style: { backgroundColor: "#F3E8FF", color: "#6D28D9" } };
    case "canceled":
      return { label: "מבוטל", style: { backgroundColor: "#FDE8E8", color: "#B91C1C" } };
  }
}

export default function DocumentView(props: {
  documentId: string;
  doc: DocumentViewSnapshot;
  /** Where the back link points; the list the user most likely came from. */
  backHref?: string;
}) {
  const router = useRouter();
  const doc = props.doc;
  const backHref = props.backHref || "/dashboard/documents/all";

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [paymentsState, setPaymentsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message?: string;
    payments?: PaymentLine[];
  }>({ status: "idle" });

  const [linksState, setLinksState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message?: string;
    links?: DocumentLinkLine[];
  }>({ status: "idle" });

  const summaryHref = useMemo(() => {
    const config = DOCUMENT_CONFIGS_BY_DB.get(doc?.document_type || "");
    if (!config) return null;
    const basePath = config.category === "business" ? "/business/documents" : "/dashboard/documents";
    return `${basePath}/${config.routeSegment}/${props.documentId}/summary`;
  }, [doc?.document_type, props.documentId]);

  const title = useMemo(() => {
    const typeLabel = getDocumentTypeLabel(doc?.document_type || "");
    const number = doc?.document_number || "—";
    return `${typeLabel} ${number}`;
  }, [doc?.document_number, doc?.document_type]);

  const uiStatus = useMemo<UIStatus>(() => {
    const links = linksState.status === "ready" ? linksState.links || [] : [];
    return computeUiStatusFromDocAndLinks({ doc, links });
  }, [doc, linksState.status, linksState.links]);

  const uiBadge = useMemo(() => getStatusBadgeFromUi(uiStatus), [uiStatus]);

  const reloadLinks = useCallback(async () => {
    if (!props.documentId) return;
    setLinksState({ status: "loading" });

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_links")
        .select(
          `
            id,
            link_type,
            amount,
            note,
            created_at,
            source:source_document_id(id, document_type, document_number, issue_date, document_status),
            target:target_document_id(id, document_type, document_number, issue_date, document_status)
          `
        )
        .or(`source_document_id.eq.${props.documentId},target_document_id.eq.${props.documentId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const links: DocumentLinkLine[] = (data || []).map((row: any) => ({
        id: row.id,
        link_type: row.link_type,
        amount: typeof row.amount === "number" ? row.amount : Number(row.amount || 0),
        note: row.note ?? null,
        created_at: row.created_at,
        source: row.source ?? null,
        target: row.target ?? null,
      }));

      setLinksState({ status: "ready", links });
    } catch (e: any) {
      setLinksState({ status: "error", message: e?.message || "שגיאה בטעינת שיוכים" });
    }
  }, [props.documentId]);

  useEffect(() => {
    if (!props.documentId) return;
    if (!doc?.document_type || !ITEM_DOCUMENT_TYPES.has(doc.document_type)) {
      setPaymentsState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setPaymentsState({ status: "loading" });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("document_line_items")
          .select("description, item_date, line_total, unit_price, currency, payment_metadata")
          .eq("document_id", props.documentId)
          .order("line_number", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const payments: PaymentLine[] = (data || []).map((item: any) => {
          const method = typeof item?.description === "string" && item.description.trim() ? item.description.trim() : "—";
          const details =
            typeof item?.payment_metadata?.description === "string" && item.payment_metadata.description.trim()
              ? item.payment_metadata.description.trim()
              : null;
          const amount =
            typeof item?.line_total === "number"
              ? item.line_total
              : typeof item?.unit_price === "number"
                ? item.unit_price
                : null;
          const currency = typeof item?.currency === "string" ? item.currency : null;
          const date = typeof item?.item_date === "string" ? item.item_date : null;
          return { method, details, amount, currency, date };
        });

        setPaymentsState({ status: "ready", payments });
      } catch (e: any) {
        if (cancelled) return;
        setPaymentsState({ status: "error", message: e?.message || "שגיאה בטעינת הנתונים" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.documentId, doc?.document_type]);

  // Load document links (incoming + outgoing)
  useEffect(() => {
    void reloadLinks();
  }, [reloadLinks]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#EDF1F5]">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-2 text-[16px] text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לרשימת המסמכים
        </Link>

        <div className="mb-5">
          <h1 className="text-right text-2xl font-bold">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span
                className="ui-badge"
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "14px",
                  fontWeight: 400,
                  ...uiBadge.style,
                }}
                title="חיווי UI בלבד"
              >
                {uiBadge.label}
              </span>
              <span>{title}</span>
            </span>
          </h1>
          {doc ? (
            <div className="mt-1 text-right text-muted-foreground text-[18px]">
              <span>תאריך מסמך: {formatDate(doc.document_date)}</span>
            </div>
          ) : null}
        </div>

        <div className="pb-4">
            {!doc ? (
              <div className="ui-alert-danger">
                <div className="font-bold">שגיאה</div>
                <div className="mt-2">אין נתונים להצגה</div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-right text-[18px]">תצוגה כללית</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 text-right text-[18px]">
                    <div className="text-right">
                      <div className="font-bold text-foreground">לקוח</div>
                      <div className="font-normal text-foreground">{doc.customer_name || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">תיאור</div>
                      <div className="font-normal text-foreground whitespace-pre-wrap">{doc.document_description || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">אמצעי תשלום</div>
                      <div className="font-normal text-foreground">{doc.payment_method || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">סכום</div>
                      <div className="font-normal text-foreground">{formatAmount(doc.total_amount, doc.currency)}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-right text-[18px]">מסמכים משוייכים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {linksState.status === "loading" ? (
                      <div className="text-right text-[18px] text-muted-foreground">טוען...</div>
                    ) : linksState.status === "error" ? (
                      <div className="ui-alert-danger">
                        <div className="font-bold">שגיאה</div>
                        <div className="mt-2">{linksState.message}</div>
                      </div>
                    ) : (linksState.links || []).length === 0 ? (
                      <div className="text-right text-[18px] text-muted-foreground">—</div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {(linksState.links || []).map((l) => {
                          const isOutgoing = l.source?.id === doc?.id;
                          const other = isOutgoing ? l.target : l.source;
                          const directionLabel = isOutgoing ? "יוצא" : "נכנס";
                          const otherLabel = other
                            ? `${getDocumentTypeLabel(other.document_type)} ${other.document_number || "—"}`
                            : "—";
                          const amountLabel = l.amount > 0 ? formatAmount(l.amount, doc?.currency || null) : null;
                          return (
                            <div key={l.id} className="rounded-md border border-border p-3">
                              <div className="flex flex-col gap-1 text-right text-[18px]">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-semibold">
                                    {formatLinkType(l.link_type)} • {directionLabel}
                                  </div>
                                  {amountLabel ? <div className="font-semibold">{amountLabel}</div> : null}
                                </div>
                                <div className="text-muted-foreground">{otherLabel}</div>
                                {l.note ? <div className="text-muted-foreground">{l.note}</div> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {doc.document_type === "receipt" || doc.document_type === "tax_invoice" ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-right text-[18px]">פרטי תשלום</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {paymentsState.status === "loading" ? (
                        <div className="text-right text-[18px] text-muted-foreground">טוען...</div>
                      ) : paymentsState.status === "error" ? (
                        <div className="ui-alert-danger">
                          <div className="font-bold">שגיאה</div>
                          <div className="mt-2">{paymentsState.message}</div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {(paymentsState.payments || []).length === 0 ? (
                            <div className="text-right text-[18px] text-muted-foreground">—</div>
                          ) : (
                            (paymentsState.payments || []).map((p, idx) => (
                              <div
                                key={idx}
                                className="rounded-md border border-border p-3"
                              >
                                <div className="flex flex-col gap-2 text-right text-[18px]">
                                  <div className="text-right">
                                    <div className="font-normal">{p.method || "—"}</div>
                                    {p.details ? (
                                      <div className="mt-1 text-muted-foreground">{p.details}</div>
                                    ) : null}
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold">{formatAmount(p.amount, p.currency)}</div>
                                    <div className="mt-1 text-muted-foreground">{formatDate(p.date)}</div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}
          </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {summaryHref ? (
            <Button type="button" variant="secondary" onClick={() => router.push(summaryHref)}>
              לעמוד המסמך
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              setDownloadError(null);
              try {
                await downloadDocumentPdf(
                  props.documentId,
                  `document-${doc?.document_number || props.documentId}.pdf`
                );
              } catch (e: any) {
                setDownloadError(e?.message || "שגיאה בהורדת המסמך");
              }
            }}
          >
            <Download className="ml-2 h-5 w-5" />
            הורדה
          </Button>
        </div>

        {downloadError ? (
          <div className="ui-alert-danger mt-3" role="alert">
            <div className="font-bold">שגיאה</div>
            <div className="mt-2">{downloadError}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

