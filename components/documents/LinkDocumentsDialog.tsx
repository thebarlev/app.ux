"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getOpenDocumentsByCustomer } from "@/lib/documents/actions";
import type { OpenDocument } from "@/lib/documents/types";

export type LinkDocumentsDialogLinkType = "payment" | "credit" | "conversion" | "related";

type SelectionState = {
  checked: boolean;
  amount: number;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatMoney(amount: number | null): string {
  if (amount === null || typeof amount !== "number") return "—";
  return amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type UIStatus = "open" | "closed" | "canceling" | "canceled";

function computeUiStatusForRow(d: OpenDocument): UIStatus {
  const dt = String(d.document_type || "").toLowerCase();
  if (dt === "credit_note") return "canceling";
  const s = String(d.accounting_status || "").toLowerCase();
  if (s === "canceled" || s === "cancelled" || s === "void") return "canceled";
  const ob = typeof d.outstanding_balance === "number" ? d.outstanding_balance : d.outstanding_balance ? Number(d.outstanding_balance) : null;
  if (typeof ob === "number" && Number.isFinite(ob)) return ob <= 0 ? "closed" : "open";
  return "open";
}

function statusLabelHe(status: UIStatus): string {
  if (status === "open") return "פתוח";
  if (status === "closed") return "סגור";
  if (status === "canceling") return "מבטל";
  return "מבוטל";
}

function currencySymbolFromCode(code: string | null | undefined): string {
  const c = String(code || "").toUpperCase();
  if (c === "ILS" || c === "NIS" || c === "₪") return "₪";
  if (c === "USD" || c === "$") return "$";
  if (c === "EUR" || c === "€") return "€";
  if (c === "GBP" || c === "£") return "£";
  return "₪";
}

export default function LinkDocumentsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  companyId: string;
  sourceDocumentId: string;
  sourceTotal: number;
  sourceCurrency?: string | null;
  linkType: LinkDocumentsDialogLinkType;
  onConfirm: (selections: { documentId: string; amount: number }[]) => void | Promise<void>;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; docs: OpenDocument[] }
  >({ status: "idle" });

  const [selections, setSelections] = useState<Record<string, SelectionState>>({});
  const [submitting, setSubmitting] = useState(false);

  const currencySymbol = currencySymbolFromCode(props.sourceCurrency);
  const isAmountRelevant = props.linkType === "payment" || props.linkType === "credit";
  const isConversion = props.linkType === "conversion";

  useEffect(() => {
    if (!props.open) return;

    let cancelled = false;
    setState({ status: "loading" });
    setSelections({});

    (async () => {
      const res = await getOpenDocumentsByCustomer(props.customerId, props.companyId);
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: "error", message: res.message || "שגיאה בטעינת מסמכים" });
        return;
      }

      const docs = (res.data || [])
        .filter((d) => d.id !== props.sourceDocumentId)
        .filter((d) => {
          if (!isConversion) return true;
          // Conversion selection is always from transaction_invoice -> current document
          return d.document_type === "transaction_invoice";
        });

      setState({ status: "ready", docs });
    })();

    return () => {
      cancelled = true;
    };
  }, [props.open, props.customerId, props.companyId, props.sourceDocumentId, isConversion]);

  const checkedIds = useMemo(() => {
    return Object.entries(selections)
      .filter(([, s]) => s.checked)
      .map(([id]) => id);
  }, [selections]);

  const sumAmounts = useMemo(() => {
    if (!isAmountRelevant) return 0;
    let sum = 0;
    for (const [id, s] of Object.entries(selections)) {
      if (!s.checked) continue;
      const n = Number(s.amount);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return sum;
  }, [isAmountRelevant, selections]);

  const rowErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};

    if (state.status !== "ready") return errors;

    const docsById = new Map(state.docs.map((d) => [d.id, d]));

    for (const [docId, s] of Object.entries(selections)) {
      if (!s.checked) continue;

      if (!isAmountRelevant) {
        errors[docId] = null;
        continue;
      }

      const amount = Number(s.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors[docId] = "יש להזין סכום גדול מ-0";
        continue;
      }

      const doc = docsById.get(docId);
      const ob = doc?.outstanding_balance;
      if (typeof ob === "number" && amount > ob) {
        errors[docId] = "הסכום גדול מהיתרה הפתוחה";
        continue;
      }

      errors[docId] = null;
    }

    return errors;
  }, [isAmountRelevant, selections, state.status, state]);

  const formError = useMemo(() => {
    if (checkedIds.length === 0) return "בחר/י לפחות מסמך אחד";

    // Per-row errors
    for (const id of checkedIds) {
      const err = rowErrors[id];
      if (err) return err;
    }

    // Sum constraint (only for payment/credit)
    if (isAmountRelevant && sumAmounts > props.sourceTotal) {
      return "סה״כ הסכומים חורג מסכום מסמך המקור";
    }

    return null;
  }, [checkedIds.length, isAmountRelevant, props.sourceTotal, rowErrors, sumAmounts]);

  async function handleConfirm() {
    if (formError) return;
    if (submitting) return;

    const items = checkedIds.map((documentId) => {
      const raw = selections[documentId]?.amount ?? 0;
      const amount = isAmountRelevant ? Number(raw || 0) : 0;
      return { documentId, amount };
    });

    setSubmitting(true);
    try {
      await props.onConfirm(items);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    props.linkType === "payment"
      ? "חיבור מסמכים (תשלום)"
      : props.linkType === "credit"
        ? "חיבור מסמכים (זיכוי)"
        : props.linkType === "conversion"
          ? "חיבור מסמכים (המרה)"
          : "חיבור מסמכים";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right">{title}</DialogTitle>
          <div className="text-right text-sm text-muted-foreground">
            סה״כ למסמך מקור: {formatMoney(props.sourceTotal)} {currencySymbol}
          </div>
        </DialogHeader>

        {state.status === "loading" ? (
          <div className="text-right text-muted-foreground">טוען...</div>
        ) : state.status === "error" ? (
          <div className="ui-alert-danger">
            <div className="font-bold">שגיאה</div>
            <div className="mt-2">{state.message}</div>
          </div>
        ) : state.status === "ready" ? (
          state.docs.length === 0 ? (
            <div className="text-right text-muted-foreground">לא נמצאו מסמכים פתוחים ללקוח זה.</div>
          ) : (
            <div className="rounded-lg border border-border">
              <Table className="text-right">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-[48px]">בחר</TableHead>
                    <TableHead className="text-right">מספר</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">סכום</TableHead>
                    <TableHead className="text-right">יתרה פתוחה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right w-[160px]">סכום לחיבור</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {state.docs.map((d) => {
                    const sel = selections[d.id] || { checked: false, amount: 0 };
                    const isChecked = !!sel.checked;
                    const rowErr = rowErrors[d.id] || null;
                    const disabledAmount = !isAmountRelevant;

                    return (
                      <TableRow key={d.id} data-state={isChecked ? "selected" : undefined}>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(next) => {
                                const checked = next === true;
                                setSelections((prev) => ({
                                  ...prev,
                                  [d.id]: {
                                    checked,
                                    amount:
                                      !checked
                                        ? prev[d.id]?.amount ?? 0
                                        : disabledAmount
                                          ? 0
                                          : prev[d.id]?.amount ?? Math.min(d.outstanding_balance ?? 0, props.sourceTotal),
                                  },
                                }));
                              }}
                              aria-label="בחירת מסמך"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{d.document_number || "—"}</TableCell>
                        <TableCell className="text-right">{d.document_type}</TableCell>
                        <TableCell className="text-right">{formatDate(d.issue_date)}</TableCell>
                        <TableCell className="text-right">{formatMoney(d.total_amount)}</TableCell>
                        <TableCell className="text-right">{formatMoney(d.outstanding_balance)}</TableCell>
                        <TableCell className="text-right">{statusLabelHe(computeUiStatusForRow(d))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <MoneyInput
                              value={disabledAmount ? 0 : sel.amount}
                              onChange={(val) => {
                                setSelections((prev) => ({
                                  ...prev,
                                  [d.id]: {
                                    checked: prev[d.id]?.checked ?? false,
                                    amount: Number.isFinite(val) ? val : 0,
                                  },
                                }));
                              }}
                              currency={currencySymbol}
                              error={!!rowErr && isChecked}
                              className={cn(disabledAmount ? "opacity-60 pointer-events-none" : "")}
                              style={{ width: 140 }}
                            />
                            {isChecked && rowErr ? (
                              <div className="text-right text-xs text-destructive">{rowErr}</div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}

        <div className="flex items-center justify-between text-right">
          <div className="text-sm text-muted-foreground">
            {isAmountRelevant ? (
              <>
                סה״כ לחיבור: {formatMoney(sumAmounts)} {currencySymbol}
              </>
            ) : (
              "בחירת מסמכים בלבד (ללא סכום)"
            )}
          </div>
          {formError ? <div className="text-sm text-destructive">{formError}</div> : null}
        </div>

        <DialogFooter className="sm:justify-start">
          <div className="flex w-full flex-row-reverse items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => props.onOpenChange(false)} disabled={submitting}>
                ביטול
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={!!formError || submitting || state.status !== "ready"}>
                אישור
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

