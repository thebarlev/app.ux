"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Download, Eye } from "lucide-react";
import { getAllDocumentConfigs } from "@/lib/documents/document-configs";

const DOCUMENT_CONFIGS_BY_DB = new Map(
  getAllDocumentConfigs().map((config) => [config.dbValue, config])
);

const ITEM_DOCUMENT_TYPES = new Set(
  getAllDocumentConfigs().map((config) => config.dbValue)
);

export type DocumentsQuickViewDocumentSnapshot = {
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
  created_at: string;
};

type PaymentLine = {
  method: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  details: string | null;
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
  return `${formatted} ${curr === "ILS" ? "₪" : curr}`;
}

function getDocumentTypeLabel(type: string): string {
  const config = DOCUMENT_CONFIGS_BY_DB.get(type);
  return config?.label || type;
}

export default function DocumentsQuickViewDrawer(props: {
  open: boolean;
  onClose: () => void;
  documentId: string | null;
  initialDoc?: DocumentsQuickViewDocumentSnapshot | null;
  onViewDocument?: () => Promise<void> | void;
  onOpenSummary?: () => Promise<void> | void;
  onDownload?: () => Promise<void> | void;
}) {
  const doc = props.initialDoc || null;

  const [isMobile, setIsMobile] = useState(false);
  const [paymentsState, setPaymentsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message?: string;
    payments?: PaymentLine[];
  }>({ status: "idle" });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const title = useMemo(() => {
    const typeLabel = getDocumentTypeLabel(doc?.document_type || "");
    const number = doc?.document_number || "—";
    return `${typeLabel} ${number}`;
  }, [doc?.document_number, doc?.document_type]);

  useEffect(() => {
    if (!props.open || !props.documentId) return;
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
  }, [props.open, props.documentId, doc?.document_type]);

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          // Move the built-in Sheet close (X) to the left side (opposite the RTL title),
          // and reserve header space so it won't overlap the title text.
          "flex flex-col bg-[#EDF1F5] z-[60] [&_[data-slot=sheet-close]]:left-4 [&_[data-slot=sheet-close]]:right-auto",
          isMobile ? "h-[85vh] rounded-t-xl" : "w-full sm:max-w-md"
        )}
      >
        <div dir="rtl" className="flex h-full flex-col bg-[#EDF1F5]">
          <SheetHeader className="flex-shrink-0 pl-14">
            <SheetTitle className="text-right text-2xl font-bold">
              {title}
            </SheetTitle>

            {doc ? (
              <div className="text-right text-muted-foreground text-[18px]">
                <span>תאריך מסמך: {formatDate(doc.document_date)}</span>
              </div>
            ) : null}
          </SheetHeader>

          <div className="flex-1 overflow-auto px-4 pb-4">
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

          <SheetFooter className="flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {["receipt", "tax_invoice"].includes(doc?.document_type || "") && props.onOpenSummary ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      await props.onOpenSummary?.();
                    }}
                  >
                    לעמוד המסמך
                  </Button>
                ) : null}

                {props.onViewDocument ? (
                  <div className="relative group">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="צפייה במסמך"
                      onClick={async () => {
                        await props.onViewDocument?.();
                      }}
                    >
                      <Eye className="h-5 w-5" />
                    </Button>
                    <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                        צפייה במסמך
                      </div>
                    </div>
                  </div>
                ) : null}

                {props.onDownload ? (
                  <div className="relative group">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="הורדה"
                      onClick={async () => {
                        await props.onDownload?.();
                      }}
                    >
                      <Download className="h-5 w-5" />
                    </Button>
                    <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:block">
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                        הורדה
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

