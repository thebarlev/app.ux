"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InitialInvoiceReceiptCreateData, InvoiceReceiptDraftPayload, PaymentRow } from "@/lib/documents/types";
import {
  issueInvoiceReceiptAction,
  saveInvoiceReceiptDraftAction,
  updateInvoiceReceiptDraftAction,
} from "./actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import ReceiptPreviewModal from "@/components/documents/ReceiptPreviewModal";
import ReceiptConfirmationModal from "@/components/documents/ReceiptConfirmationModal";
import ReceiptSuccessModal from "@/components/documents/ReceiptSuccessModal";
import { InvoiceDecisionModal, type InvoiceDecisionType } from "@/components/documents/InvoiceDecisionModal";
import {
  DocumentIssueFailureModal,
  type DocumentIssueFailure,
} from "@/components/documents/DocumentIssueFailureModal";
import { buildDocumentReturnPath, buildShaamConnectUrl } from "@/lib/shaam/connect-url";
import {
  buildChainedConversionLink,
  buildChainedPaymentLink,
  chainSupersedesSource,
  chainedTotalFromSource,
  sourceAppliedRounding,
  validateChainedAmount,
} from "@/lib/documents/chaining";
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
import PaymentDetailsSection from "../receipt/PaymentDetailsSection";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingTextarea } from "@/components/ui/floating-textarea";
import { FloatingDateInput } from "@/components/ui/floating-date-input";
import { DateInput } from "@/components/ui/date-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import { getDocumentConfig } from "@/lib/documents/document-configs";
import { Trash2, Save, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createDocumentLinkAction, getDocumentForChainingAction } from "@/lib/documents/actions";
import { FxRateDialog } from "@/components/payments/FxRateDialog";
import { SubscriptionBlockModal, type SubscriptionBlockKind } from "@/components/subscription/SubscriptionBlockModal";
import { currencySymbol } from "@/lib/currency/symbol";

const PAYMENT_METHODS = [
  "העברה בנקאית",
  "Bit",
  "PayBox",
  "כרטיס אשראי",
  "מזומן",
  "צ׳ק",
  "PayPal",
  "Payoneer",
  "Google Pay",
  "Apple Pay",
  "ביטקוין",
  "אתריום",
  "שובר BuyME",
  "שובר מתנה",
  "שווה כסף",
  "V-CHECK",
  "Colu",
  "Pay",
  "ניכוי במקור",
  "ניכוי חלק עובד טל״א",
  "ניכוי אחר",
];

type ItemRow = {
  label: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  vatMode: "before" | "included";
};


function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currencySymbol(currency || "ILS")}`;
}

export default function InvoiceReceiptFormClient({
  initial,
  editData,
  draftId: draftIdProp,
}: {
  initial: InitialInvoiceReceiptCreateData;
  editData?: {
    id: string;
    customerName: string;
    documentDate: string;
    paymentDueDate?: string;
    total: number;
    currency: string;
    notes: string;
    vatType?: "regular" | "no_vat";
    vatRate?: number | null;
    vatAmount?: number | null;
    subtotal?: number | null;
    description?: string;
    items?: Array<{
      label: string;
      sku: string;
      description: string;
      quantity: number;
      unitPrice: number;
      currency: string;
      vatMode: "before" | "included";
    }>;
    payments?: PaymentRow[];
  } | null;
  draftId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = draftIdProp ?? (initial.ok ? initial.draftId ?? undefined : undefined);
  const documentConfig = useMemo(() => getDocumentConfig("invoiceReceipt"), []);
  const documentLabel = "חשבונית מס / קבלה";
  const basePath = "/dashboard/documents";

  const shouldShowStartingNumberOnInit = initial.ok && !initial.sequenceLocked && !draftId;
  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(shouldShowStartingNumberOnInit);

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["ILS", "USD", "EUR"]
  );
  const [currency, setCurrency] = useState<string>(
    initial.ok ? (initial.settings.currency || "ILS") : "ILS"
  );
  const isFxScenario = language === "en" && currency === "ILS";
  const [vatType, setVatType] = useState<"regular" | "no_vat">("regular");
  const defaultVatRate = useMemo(() => {
    const base = initial.ok ? initial.vatRate ?? 18 : 18;
    return Number.isFinite(base) ? base : 18;
  }, [initial]);
  const vatRate = vatType === "no_vat" ? 0 : defaultVatRate;

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [chainSourceDocumentId, setChainSourceDocumentId] = useState<string | null>(null);
  /** Source total, its remaining balance, and its type — for the cap and for
   *  deciding whether this document supersedes the source. */
  const [chainSourceTotal, setChainSourceTotal] = useState<number | null>(null);
  const [chainSourceRemaining, setChainSourceRemaining] = useState<number | null>(null);
  const [chainSourceType, setChainSourceType] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<{
    [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string };
  }>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState("");

  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const itemsTableRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<ItemRow[]>([
    { label: "", sku: "", description: "", quantity: 1, unitPrice: 0, currency, vatMode: "before" },
  ]);
  const [confirmedRows, setConfirmedRows] = useState<Set<number>>(new Set());
  const [showItemsApprovalWarning, setShowItemsApprovalWarning] = useState(false);

  // Payment rows state (from Receipt)
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", date: todayYmd(), amount: 0, currency }]);
  const [confirmedPayments, setConfirmedPayments] = useState<Set<number>>(new Set());
  const [showPaymentsApprovalWarning, setShowPaymentsApprovalWarning] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState<Record<number, { method?: string; amount?: string }>>({});
  const [fxLoading, setFxLoading] = useState<Record<number, boolean>>({});
  const [fxApiErrors, setFxApiErrors] = useState<Record<number, string>>({});

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [blockModalKind, setBlockModalKind] = useState<null | SubscriptionBlockKind>(null);
  const [mismatchWarningOpen, setMismatchWarningOpen] = useState(false);

  // Recipient consent is treated as granted-on-login (no UI / no blocking).

  const [successModalData, setSuccessModalData] = useState<{
    documentId: string;
    documentNumber: string;
    companyName: string;
    documentTypeLabel: string;
    language: "he" | "en";
  } | null>(null);

  const [shaamReconnectRequired, setShaamReconnectRequired] = useState(false);
  const [issueFailure, setIssueFailure] = useState<DocumentIssueFailure | null>(null);
  const [shaamJustConnected, setShaamJustConnected] = useState(false);

  // Leaves for the tax authority carrying the current document URL, so the
  // callback brings the user back here rather than to the settings screen.
  // The draft is already saved server-side, so nothing entered is lost.
  const goConnectShaam = useCallback(() => {
    const currentDraftId = draftId || (editData as any)?.id || undefined;
    window.location.href = buildShaamConnectUrl(buildDocumentReturnPath(currentDraftId));
  }, [draftId, editData]);

  // Returning from the SHAAM OAuth round-trip: confirm, and clear the one-shot
  // marker so a refresh does not replay it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("shaam_connected") === "1";
    const shaamError = params.get("shaam_error");
    if (!connected && !shaamError) return;

    if (connected) {
      setShaamJustConnected(true);
      setShaamReconnectRequired(false);
      toast.success("החיבור לרשות המסים הושלם. אפשר להמשיך בהפקת המסמך.");
    } else {
      setIssueFailure({
        message: "ההתחברות לרשות המסים לא הושלמה.",
        reason: "shaam_reconnect_required",
        needsShaamConnect: true,
      });
    }

    params.delete("shaam_connected");
    params.delete("shaam_error");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);
  const [shaamDecision, setShaamDecision] = useState<{
    open: boolean;
    errorId: string;
    documentId: string;
    payload: InvoiceReceiptDraftPayload | null;
    draftId: string | undefined;
  }>({ open: false, errorId: "", documentId: "", payload: null, draftId: undefined });

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const summaryBlockRef = useRef<HTMLDivElement | null>(null);
  const summaryRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const summaryValueRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const addItemButtonRef = useRef<HTMLDivElement | null>(null);
  const headerTotalRef = useRef<HTMLDivElement | null>(null);
  const itemTotalRef = useRef<HTMLDivElement | null>(null);
  const summaryOuterRef = useRef<HTMLDivElement | null>(null);
  const summaryLabelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const summaryValueContainerRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setDueDate(editData.paymentDueDate || editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      if (editData.vatType) setVatType(editData.vatType);
      if (typeof editData.description === "string") setDescription(editData.description);

      if (Array.isArray((editData as any).items) && (editData as any).items.length > 0) {
        const loadedItems = (editData as any).items.map((item: any) => ({
          label: item.label || "",
          sku: item.sku || "",
          description: item.description || "",
          quantity: typeof item.quantity === "number" ? item.quantity : 1,
          unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : 0,
          currency: item.currency || editData.currency,
          vatMode: item.vatMode === "included" ? "included" : "before",
        }));
        setItems(loadedItems);
        setConfirmedRows(new Set(loadedItems.map((_: any, idx: number) => idx)));
      }

      if (Array.isArray((editData as any).payments) && (editData as any).payments.length > 0) {
        const loadedPayments = (editData as any).payments as PaymentRow[];
        setPayments(loadedPayments);
        setConfirmedPayments(new Set(loadedPayments.map((_, idx) => idx)));
      }
    }
  }, [editData]);









  // Optional prefill from URL params (UI only; no DB logic changes)
  useEffect(() => {
    if (editData || draftId) return;
    const prefillCustomerId = searchParams.get("customerId");
    const prefillCustomerName = searchParams.get("customerName");
    const prefillNotes = searchParams.get("notes");
    const prefillSourceDocumentId = searchParams.get("sourceDocumentId");

    if (prefillCustomerId) setCustomerId(prefillCustomerId);
    if (prefillCustomerName) setCustomerName(prefillCustomerName);
    if (prefillNotes) setNotes(prefillNotes);
    if (prefillSourceDocumentId) {
      setChainSourceDocumentId(prefillSourceDocumentId);
      // Load items from source document
      getDocumentForChainingAction(prefillSourceDocumentId).then((res) => {
        if (res.ok) {
          const doc = res.document as any;

          // This form was left out of the chaining work, so an invoice-receipt
          // chained from a חשבון עסקה opened with only its item rows: no
          // customer, no ח.פ/ת.ז, no description, and a total recomputed from
          // the net base that lost the source's rounding.
          setChainSourceTotal(chainedTotalFromSource(doc.totalAmount));
          setChainSourceType(doc.documentType ?? null);
          setChainSourceRemaining(
            doc.outstandingBalance === null || doc.outstandingBalance === undefined
              ? null
              : Number(doc.outstandingBalance)
          );
          if (doc.customerName) setCustomerName(String(doc.customerName));
          if (doc.customerId) setCustomerId(String(doc.customerId));
          if (doc.customerTaxId) setCustomerTaxId(String(doc.customerTaxId).replace(/\D/g, ""));
          if (doc.documentDescription) setDescription(String(doc.documentDescription));
          // Carry the source's rounding so the chained total matches the amount
          // actually issued, to the agora.
          if (sourceAppliedRounding(doc)) setRoundTotals(true);
          // The association line is NOT written here — the documents list already
          // passes it as ?notes=.
        }
        if (res.ok && res.document.items && res.document.items.length > 0) {
          const loadedItems = res.document.items.map(item => ({
            label: item.label,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            vatMode: item.vatMode,
          }));
          
          setItems(loadedItems);
          
          // Mark all loaded items as confirmed
          setConfirmedRows(new Set(loadedItems.map((_, idx) => idx)));
        }
      });
    }
  }, [searchParams, editData, draftId]);

  useEffect(() => {
    if (dueDate < documentDate) {
      setDueDate(documentDate);
    }
  }, [documentDate, dueDate]);

  const previewNumber = initial.ok ? initial.previewNumber : null;

  const getLineGross = useCallback((item: ItemRow) => {
    const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
    const unit = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
    return Number((qty * unit).toFixed(2));
  }, []);

  const getLineNet = useCallback(
    (item: ItemRow) => {
      const gross = getLineGross(item);
      if (vatRate <= 0) return gross;
      if (item.vatMode === "included") {
        const net = gross / (1 + vatRate / 100);
        return Number(net.toFixed(2));
      }
      return gross;
    },
    [getLineGross, vatRate]
  );

  const getLineVat = useCallback(
    (item: ItemRow) => {
      if (vatRate <= 0) return 0;
      const net = getLineNet(item);
      if (item.vatMode === "included") {
        const gross = getLineGross(item);
        return Number((gross - net).toFixed(2));
      }
      return Number((net * (vatRate / 100)).toFixed(2));
    },
    [getLineGross, getLineNet, vatRate]
  );

  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + getLineNet(item), 0);
  }, [items, getLineNet]);
  const vatAmount = useMemo(() => {
    if (vatRate <= 0) return 0;
    return Number(items.reduce((acc, item) => acc + getLineVat(item), 0).toFixed(2));
  }, [items, vatRate, getLineVat]);
  const total = useMemo(() => {
    if (vatRate <= 0) return subtotal;
    const sum = subtotal + vatAmount;
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [subtotal, vatAmount, vatRate, roundTotals]);

  const paymentsTotal = useMemo(() => {
    return payments.reduce((acc, p, idx) => {
      if (!confirmedPayments.has(idx)) return acc;
      const amt = Number.isFinite(p.amount) ? p.amount : 0;
      if (!isFxScenario) return acc + amt;
      const rowCur = String(p.currency || currency);
      if (rowCur === "ILS") return acc + amt;
      const fx = Number((p as any).fxRate);
      if (!Number.isFinite(fx) || fx <= 0) return acc;
      return acc + amt * fx;
    }, 0);
  }, [payments, confirmedPayments, isFxScenario, currency]);
  const hasConfirmedItems = confirmedRows.size > 0;
  const hasConfirmedPayments = confirmedPayments.size > 0;
  const unconfirmedItemRowIndices = useMemo(() => {
    const out: number[] = [];
    items.forEach((_, idx) => {
      if (!confirmedRows.has(idx)) out.push(idx);
    });
    return out;
  }, [items, confirmedRows]);
  const unconfirmedPaymentRowIndices = useMemo(() => {
    const out: number[] = [];
    payments.forEach((_, idx) => {
      if (!confirmedPayments.has(idx)) out.push(idx);
    });
    return out;
  }, [payments, confirmedPayments]);
  const allItemsConfirmed = items.length > 0 && unconfirmedItemRowIndices.length === 0;
  const allPaymentsConfirmed = payments.length > 0 && unconfirmedPaymentRowIndices.length === 0;

  useEffect(() => {
    if (unconfirmedItemRowIndices.length === 0) setShowItemsApprovalWarning(false);
  }, [unconfirmedItemRowIndices.length]);

  useEffect(() => {
    if (unconfirmedPaymentRowIndices.length === 0) setShowPaymentsApprovalWarning(false);
  }, [unconfirmedPaymentRowIndices.length]);

  const payload: InvoiceReceiptDraftPayload = useMemo(() => {
    return {
      documentType: "invoiceReceipt",
      customerName,
      customerId,
      customerTaxId: customerTaxId.replace(/\D/g, "") || null,
      documentDate,
      paymentDueDate: "",
      description,
      payments: payments,
      items: items.map((item) => ({
        ...item,
        lineTotal: getLineNet(item),
      })),
      notes,
      currency,
      total,
      vatType,
      vatRate,
      vatAmount,
      subtotal,
      roundTotals,
      language,
    };
  }, [
    customerName,
    customerId,
    customerTaxId,
    documentDate,
    description,
    items,
    payments,
    notes,
    currency,
    total,
    getLineNet,
    vatType,
    vatRate,
    vatAmount,
    subtotal,
    roundTotals,
    language,
  ]);

  // Update payment currencies when currency changes
  useEffect(() => {
    if (currency !== "ILS") {
      setPayments((prev) =>
        prev.map((p) => ({
          ...p,
          currency,
          fxRate: undefined,
          fxRateDate: undefined,
          fxRateSource: undefined,
        }))
      );
      return;
    }
    if (!isFxScenario) {
      setPayments((prev) =>
        prev.map((p) => ({
          ...p,
          currency: "ILS",
          fxRate: undefined,
          fxRateDate: undefined,
          fxRateSource: undefined,
        }))
      );
    }
  }, [currency, isFxScenario]);

  useEffect(() => {
    if (currency !== "ILS") {
      setItems((prev) => prev.map((item) => ({ ...item, currency })));
    }
  }, [currency]);

  async function fetchFxRateForRow(i: number, baseCurrency: string, paymentDate: string) {
    const base = String(baseCurrency || "").toUpperCase().trim();
    const date = String(paymentDate || "").trim();
    if (!/^[A-Z]{3}$/.test(base) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    setFxLoading((prev) => ({ ...prev, [i]: true }));
    setFxApiErrors((prev) => {
      if (!prev[i]) return prev;
      const next = { ...prev };
      delete next[i];
      return next;
    });
    try {
      const res = await fetch(`/api/fx-rate?base=${encodeURIComponent(base)}&date=${encodeURIComponent(date)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "FX rate fetch failed");
      setPayments((prev) =>
        prev.map((r, idx) =>
          idx === i
            ? {
                ...r,
                fxRate: Number(json.rate),
                fxRateDate: String(json.rateDate || ""),
                fxRateSource: "boi",
              }
            : r
        )
      );
    } catch {
      setFxApiErrors((prev) => ({
        ...prev,
        [i]: "לא ניתן להביא שער המרה כרגע, אנא נסה שוב או הזן ידנית",
      }));
      setPaymentErrors((prev) => ({
        ...prev,
        [i]: { ...(prev[i] || {}), amount: "חסר שער המרה" },
      }));
    } finally {
      setFxLoading((prev) => ({ ...prev, [i]: false }));
    }
  }



  if (!initial.ok) {
    return (
      <div className="p-4 border-2 border-red-200 rounded-xl bg-red-50">
        <div className="font-bold text-red-900 mb-2">שגיאה בטעינת הנתונים</div>
        <div className="text-red-700">{initial.message}</div>
      </div>
    );
  }

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      { label: "", sku: "", description: "", quantity: 1, unitPrice: 0, currency, vatMode: "before" },
    ]);
  }

  function updateItemRow(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setConfirmedRows((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function removeItemRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setConfirmedRows((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function validateItemRow(item: ItemRow) {
    const errors: { description?: string; quantity?: string; unitPrice?: string; currency?: string } = {};
    if (!item.description || item.description.trim().length === 0) {
      errors.description = "חובה למלא פירוט";
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.quantity = "כמות חייבת להיות גדולה מ-0";
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      errors.unitPrice = "מחיר חייב להיות גדול מ-0";
    }
    if (!item.currency) {
      errors.currency = "חובה לבחור מטבע";
    }
    return errors;
  }

  function confirmItemRow(i: number) {
    const errors = validateItemRow(items[i]);
    if (Object.keys(errors).length > 0) {
      setItemErrors((prev) => ({ ...prev, [i]: errors }));
      return;
    }
    setItemErrors((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      return next;
    });
    setConfirmedRows((prev) => new Set(prev).add(i));
  }

  // Payment functions (from Receipt)
  function addPaymentRow() {
    setPayments((prev) => [...prev, { method: "", date: todayYmd(), amount: 0, currency }]);
  }

  function updatePaymentRow(i: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setConfirmedPayments((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
    setConfirmedPayments((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function validatePaymentRow(payment: PaymentRow) {
    const errors: { method?: string; amount?: string } = {};
    if (!payment.method || payment.method.trim().length === 0) {
      errors.method = "חובה לבחור אמצעי תשלום";
    }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      errors.amount = "סכום חייב להיות גדול מ-0";
    }
    if (isFxScenario) {
      const rowCur = String(payment.currency || currency);
      if (rowCur !== "ILS") {
        const fx = Number((payment as any).fxRate);
        if (!Number.isFinite(fx) || fx <= 0) {
          errors.amount = "חובה לעדכן שער המרה";
        }
      }
    }
    return errors;
  }

  function confirmPaymentRow(i: number) {
    const errors = validatePaymentRow(payments[i]);
    if (Object.keys(errors).length > 0) {
      setPaymentErrors((prev) => ({ ...prev, [i]: errors }));
      return;
    }
    setPaymentErrors((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      return next;
    });
    setConfirmedPayments((prev) => new Set(prev).add(i));
  }

  // Validation: Check if items total matches payments total
  function validateTotalsMismatch(): boolean {
    const itemsTotal = total; // This includes VAT
    
    // Allow small rounding differences (0.01)
    const diff = Math.abs(itemsTotal - paymentsTotal);
    return diff > 0.01;
  }

  function getLineTotal(item: ItemRow) {
    return getLineNet(item);
  }

  function focusFieldWithError(fieldRef: React.RefObject<HTMLElement | null>) {
    if (!fieldRef?.current) return;
    fieldRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldRef.current.classList.add("error-field");
    setTimeout(() => fieldRef.current?.classList.remove("error-field"), 3000);
  }

  async function handlePreview() {
    if (!customerName || customerName.trim().length === 0) {
      toast.error("חובה למלא שם לקוח");
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }

    if (!documentDate) {
      toast.error("חובה לבחור תאריך");
      return;
    }

    if (!items || items.length === 0) {
      toast.error("חובה להוסיף לפחות פריט אחד");
      return;
    }

    const previewErrors: {
      [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string };
    } = {};
    items.forEach((item, i) => {
      const rowErrors = validateItemRow(item);
      if (Object.keys(rowErrors).length > 0) previewErrors[i] = rowErrors;
    });
    if (Object.keys(previewErrors).length > 0) {
      setItemErrors(previewErrors);
      focusFieldWithError(itemsTableRef);
      return;
    }

    if (!allItemsConfirmed || !allPaymentsConfirmed) {
      if (!allItemsConfirmed) setShowItemsApprovalWarning(true);
      if (!allPaymentsConfirmed) setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני תצוגה מקדימה");
      focusFieldWithError(!allItemsConfirmed ? itemsTableRef : paymentsTableRef);
      return;
    }

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
      return;
    }

    setPreviewModalOpen(true);
    setBusy("preview");
    setPreviewError(null);
    setPreviewPdfUrl(null);

    try {
      const itemsForPreview = items.map((item) => ({
        label: item.label || "",
        sku: item.sku || "",
        description: item.description || "",
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        currency: item.currency || currency,
        vatMode: item.vatMode,
        lineTotal: getLineNet(item),
      }));

      const params = new URLSearchParams({
        previewNumber: previewNumber || "",
        customerName: customerName || "",
        customerId: customerId || "",
        documentDate: documentDate || todayYmd(),
        paymentDueDate: "",
        description: description || "",
        notes: notes || "",
        total: total.toString() || "0",
        subtotal: subtotal.toString(),
        vatRate: vatRate.toString(),
        vatAmount: vatAmount.toString(),
        vatType: vatType,
        currency: currency || "ILS",
        items: JSON.stringify(itemsForPreview),
      });

      const docIdForPreview = draftId || (editData as any)?.id || null;
      if (docIdForPreview) params.set("documentId", String(docIdForPreview));

      setPreviewPdfUrl(`${basePath}/invoice-receipt/preview?${params.toString()}`);
      setBusy(null);
    } catch (error: any) {
      setBusy(null);
      const errorMessage = error?.message || "שגיאה ביצירת תצוגה מקדימה";
      setPreviewError(errorMessage);
      toast.error(errorMessage);
    }
  }

  async function handleSaveDraft() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setItemErrors({});

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
      return;
    }

    setBusy("draft");
    try {
      let result;
      if (draftId && editData) result = await updateInvoiceReceiptDraftAction(draftId, payload);
      else result = await saveInvoiceReceiptDraftAction(payload);

      if (!result.ok) {
        toast.error(result.message || "שמירת טיוטה נכשלה");
        setBusy(null);
        return;
      }

      toast.success("הטיוטה נשמרה");
      setBusy(null);
      window.location.href = basePath;
    } catch (error: any) {
      toast.error(error.message || "שמירת טיוטה נכשלה");
      setBusy(null);
    }
  }

  function handleIssueConfirmation() {
    if (!allItemsConfirmed || !allPaymentsConfirmed) {
      if (!allItemsConfirmed) setShowItemsApprovalWarning(true);
      if (!allPaymentsConfirmed) setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני הפקת מסמך");
      focusFieldWithError(!allItemsConfirmed ? itemsTableRef : paymentsTableRef);
      return;
    }
    // A chained document may settle its source in full or in part, never for
    // more — and the ceiling is the source's REMAINING balance, so receipts
    // cannot together exceed it.
    if (chainSourceDocumentId && chainSourceTotal !== null) {
      const cap = validateChainedAmount({
        chainedTotal: total,
        sourceTotal: chainSourceTotal,
        sourceRemaining: chainSourceRemaining,
      });
      if (!cap.ok) {
        setIssueFailure({ message: cap.message, reason: "chained_amount_above_source" });
        return;
      }
    }
    setConfirmationModalOpen(true);
  }

  // Consent loading removed (no longer required).

  async function handleIssueConfirm() {
    setIsFinalizing(true);
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setItemErrors({});
    setPaymentErrors({});

    if (!sequenceLocked) {
      toast.error("נדרש לבחור מספר התחלתי לפני הפקת מסמכים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      setShowStartingNumberModal(true);
      return;
    }

    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el =
            (descriptionInputRef.current as any) ||
            (typeof document !== "undefined" ? document.getElementById("description") : null);
          if (el?.scrollIntoView) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus?.();
            el.classList?.add?.("error-field");
            setTimeout(() => el.classList?.remove?.("error-field"), 3000);
          }
        });
      });
      return;
    }

    if (!allItemsConfirmed || !allPaymentsConfirmed) {
      if (!allItemsConfirmed) setShowItemsApprovalWarning(true);
      if (!allPaymentsConfirmed) setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני הפקת מסמך");
      focusFieldWithError(!allItemsConfirmed ? itemsTableRef : paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    const errors: { [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string } } =
      {};
    items.forEach((item, i) => {
      const rowErrors = validateItemRow(item);
      if (Object.keys(rowErrors).length > 0) errors[i] = rowErrors;
    });

    if (Object.keys(errors).length > 0) {
      setItemErrors(errors);
      focusFieldWithError(itemsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    // Recipient consent is not required for issuing.

    setBusy("issue");
    try {
      const effectiveDraftId = draftId || (editData as any)?.id || undefined;
      const result = await issueInvoiceReceiptAction(payload, effectiveDraftId);

      if (!result || !result.ok) {
        const reason = (result as any)?.reason as string | null | undefined;
        const shaam = (result as any)?.shaam as any;
        if (shaam?.kind === "reconnect_required") {
          setShaamReconnectRequired(true);
          setIssueFailure({
            message: result?.message || "יצירת מסמך זה דורשת חיבור לרשות המסים.",
            reason: reason || "shaam_reconnect_required",
            needsShaamConnect: true,
          });
          setBusy(null);
          setIsFinalizing(false);
          setConfirmationModalOpen(false);
          return;
        } else if (shaam?.kind === "decision_required") {
          setShaamReconnectRequired(false);
          const docIdForDecision =
            String((result as any)?.documentId || effectiveDraftId || "").trim() || "";
          setShaamDecision({
            open: true,
            errorId: String(shaam?.error_id || "").trim(),
            documentId: docIdForDecision,
            payload,
            draftId: effectiveDraftId,
          });
          setBusy(null);
          setIsFinalizing(false);
          return;
        }
        if (reason === "limit_reached") {
          setBlockModalKind("free_quota");
        } else if (reason === "subscription_expired" || reason === "past_due" || reason === "account_blocked") {
          setBlockModalKind("renewal_required");
        } else {
          // Never a bare toast: a document that did not issue must state why and
          // what is missing, in something the user has to dismiss.
          setIssueFailure({
            message: result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה",
            reason: reason || null,
          });
        }
        setBusy(null);
        setIsFinalizing(false);
        setConfirmationModalOpen(false);
        return;
      }

      setConfirmationModalOpen(false);
      setBusy(null);
      setShaamReconnectRequired(false);

      if (chainSourceDocumentId) {
        // Fetch source document to check if we should create payment link
        const sourceDoc = await getDocumentForChainingAction(chainSourceDocumentId);
        
        const note = notes ? `שרשור: ${notes}` : null;

        // An invoice-receipt collects money, so it settles its source — always a
        // payment link, for whatever it actually collects, with the source as the
        // target so recompute_document_accounting accumulates onto it. The old
        // exact-match rule dropped partial payments to a "related" link with
        // amount 0 and left the source open.
        // A חשבון עסקה is replaced by the document issued for it; anything else
        // is settled by the money this document collects.
        const supersedes = chainSupersedesSource({
          sourceDocumentType: chainSourceType,
          targetDocumentType: "invoice_receipt",
        });
        const linkRes = await createDocumentLinkAction(
          supersedes
            ? buildChainedConversionLink({
                sourceDocumentId: chainSourceDocumentId,
                chainedDocumentId: result.documentId || "",
                amount: total,
                note,
              })
            : buildChainedPaymentLink({
                sourceDocumentId: chainSourceDocumentId,
                chainedDocumentId: result.documentId || "",
                amount: total,
                note,
              })
        );
        if (!linkRes.ok) {
          toast.error(linkRes.message || "השרשור נכשל: לא ניתן ליצור קשר בין המסמכים");
        }
      }

      setSuccessModalData({
        documentId: result.documentId || "",
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: "חשבונית מס / קבלה",
        language,
      });
      setSuccessModalOpen(true);
    } catch (error: any) {
      toast.error(`שגיאה בהפקת המסמך: ${error?.message || String(error) || "שגיאה לא ידועה"}`);
      setBusy(null);
      setIsFinalizing(false);
      return;
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen ui-document-form">
      <InvoiceDecisionModal
        open={shaamDecision.open}
        errorId={shaamDecision.errorId}
        onOpenChange={(open) => setShaamDecision((s) => ({ ...s, open }))}
        onSelect={async (decision: InvoiceDecisionType) => {
          const docId = String(shaamDecision.documentId || "").trim();
          if (!docId) {
            toast.error("חסר מזהה מסמך לשליחת החלטה");
            return;
          }

          const res = await fetch("/api/shaam/invoice-decision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ document_id: docId, decision }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok) {
            const msg = (json && (json.message || json.details)) || "שליחת החלטה נכשלה";
            toast.error(msg);
            return;
          }

          if (decision === "CONTINUE") {
            setShaamDecision((s) => ({ ...s, open: false }));
            const p = shaamDecision.payload;
            const dId = shaamDecision.draftId;
            if (p) {
              setBusy("issue");
              const retry = await issueInvoiceReceiptAction(p, dId);
              setBusy(null);
              if (!retry || !retry.ok) {
                toast.error(retry?.message || "הפקת המסמך נכשלה לאחר המשך ללא מספר הקצאה");
                return;
              }
              setSuccessModalData({
                documentId: retry.documentId || "",
                documentNumber: retry.documentNumber || "",
                companyName: retry.companyName || "העסק שלי",
                documentTypeLabel: "חשבונית מס / קבלה",
                language,
              });
              setSuccessModalOpen(true);
              return;
            }
          }

          if (decision === "CANCEL") {
            setShaamDecision((s) => ({ ...s, open: false }));
            toast.success("המסמך בוטל");
            return;
          }

          if (decision === "FURTHEROBJECTION") {
            setShaamDecision((s) => ({ ...s, open: false }));
            toast.success("נשלחה בקשת שימוע. לא ניתן להפיק את המסמך עד להמשך טיפול.");
            return;
          }
        }}
      />
      <SubscriptionBlockModal
        isOpen={blockModalKind !== null}
        kind={blockModalKind || "free_quota"}
        onClose={() => setBlockModalKind(null)}
        onPrimary={() => {
          setBlockModalKind(null);
          router.push("/pricing");
        }}
      />
      <DocumentIssueFailureModal
        failure={issueFailure}
        onClose={() => setIssueFailure(null)}
        onConnectShaam={goConnectShaam}
      />
      <div className="w-full pt-2 px-4 sm:px-6 lg:px-8">
        <div className="ui-container" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {shaamReconnectRequired ? (
            <Card className="mb-6 border-danger bg-danger/10">
              <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-right">
                  <div className="font-semibold">יצירת מסמך זה דורשת חיבור לרשות המסים.</div>
                  <div className="text-sm">מה שהזנת נשמר — אחרי ההתחברות תוחזר לכאן כדי לסיים.</div>
                </div>
                <Button onClick={goConnectShaam} className="w-full sm:w-auto">
                  התחבר עכשיו
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {shaamJustConnected ? (
            <Card className="mb-6 border-success bg-success/10">
              <CardContent className="p-4 text-right">
                <div className="font-semibold">החיבור לרשות המסים הושלם.</div>
                <div className="text-sm">הפרטים שהזנת נשמרו — לחץ "לאישור והפקה" כדי לסיים.</div>
              </CardContent>
            </Card>
          ) : null}
          {message && (
            <Card
              className={cn(
                "mb-[50px]",
                message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
              )}
            >
              <CardContent className="p-4">
                <div
                  className={cn(
                    "flex items-center gap-3 font-medium",
                    message.includes("שגיאה") ? "text-danger" : "text-success"
                  )}
                >
                  {message.includes("שגיאה") && "⚠️"}
                  {!message.includes("שגיאה") && "✓"}
                  <span>{message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <ReceiptSettingsSummary
            settings={{
              currency,
              language,
              vatType,
              roundTotals,
              allowedCurrencies,
              allowedLanguages: [
                { value: "he", label: "עברית" },
                { value: "en", label: "English" },
              ],
              allowedVatTypes: [
                { value: "regular", label: "כולל מע״מ", summaryLabel: "כולל מע״מ (ברירת מחדל)" },
                { value: "no_vat", label: "ללא מע״מ (אילת / חו״ל)" },
              ],
              canEdit: {
                currency: true,
                language: true,
                vatType: true,
                roundTotals: true,
              },
            }}
            onChange={(patch) => {
              if (patch.currency !== undefined) setCurrency(patch.currency);
              if (patch.language !== undefined) setLanguage(patch.language as "he" | "en");
              if (patch.roundTotals !== undefined) setRoundTotals(patch.roundTotals);
              if (patch.vatType !== undefined) setVatType(patch.vatType as "regular" | "no_vat");
            }}
          />

          <div className="mb-[50px]">
            <div className="flex justify-between items-center">
              <h1 className="text-right">
                {documentLabel} {previewNumber || "---"}
              </h1>
            </div>
            {initial.companyName && <h2 className="text-right mt-[10px] mb-[40px]">{initial.companyName}</h2>}
          </div>

          <form className="ui-section-gap">
            <FormSection title="פרטי המסמך" description="">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px]  border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                <div
                  className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]"
                  data-payment-primary-grid="true"
                >
                  <div ref={customerNameRef}>
                    <CustomerAutocomplete
                      id="customerName"
                      label="שם לקוח"
                      required
                      error={customerNameError}
                      value={customerName}
                      onChange={(value) => {
                        setCustomerName(value);
                        if (customerNameError && value.trim().length > 0) setCustomerNameError(null);
                      }}
                      onSelectCustomer={(customer) => {
                        if (customer) {
                          setCustomerId(customer.id);
                          setCustomerNameError(null);
                          // Prefill from the saved customer, but leave it editable —
                          // the document may need a different number than the record.
                          if (customer.tax_id) setCustomerTaxId(String(customer.tax_id));
                        }
                      }}
                      onAddNewCustomer={() => setShowQuickAddModal(true)}
                      placeholder="התחל להקליד שם לקוח..."
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <div>
                    <FloatingInput
                      id="customerTaxId"
                      label="מספר עוסק / ח.פ של הלקוח"
                      value={customerTaxId}
                      onChange={(e) => setCustomerTaxId(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      inputMode="numeric"
                      placeholder="9 ספרות"
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <FloatingDateInput
                    label="תאריך מסמך"
                    required
                    id="documentDate"
                    value={documentDate}
                    onChange={(value) => {
                      if (minAllowedDate && value < minAllowedDate) setDocumentDate(minAllowedDate);
                      else setDocumentDate(value);
                    }}
                    min={minAllowedDate || undefined}
                    containerClassName="w-full min-w-0 ui-document-date-offset"
                  />
                </div>
              </div>
            </FormSection>

            <FormSection title="פרטי המסמך" description="">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                  <div className="ui-field-wide w-full min-w-0">
                    <div className="w-1/2">
                      <FloatingInput
                        label="תיאור"
                        required
                        error={descriptionError}
                        id="description"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          if (descriptionError && e.target.value.trim().length >= 5) setDescriptionError(null);
                        }}
                        helperText="מינימום 5 תווים - לדוגמה: שירותי עיצוב גרפי"
                        containerClassName="w-full min-w-0"
                        {...({ ref: descriptionInputRef } as any)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection title="רשימת פריטים" description="">
              <div ref={itemsTableRef} className="space-y-[10px]">
                {(Object.keys(itemErrors).length > 0 ||
                  (showItemsApprovalWarning && unconfirmedItemRowIndices.length > 0)) && (
                  <div
                    style={{
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #9B0003",
                      borderRadius: "8px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "20px" }}>⚠️</span>
                      <span style={{ fontSize: "16px", fontWeight: 600, color: "#9B0003" }}>
                        {Object.keys(itemErrors).length > 0
                          ? "יש לתקן את השדות המסומנים באדום"
                          : "יש לאשר את השורות לפני המשך"}
                      </span>
                    </div>
                    {showItemsApprovalWarning && unconfirmedItemRowIndices.length > 0 ? (
                      <div style={{ marginTop: "8px", fontSize: "14px", color: "#9B0003" }}>
                        יש {unconfirmedItemRowIndices.length} שורות שלא אושרו — לחץ/י על &quot;אישור&quot; בכל שורה
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="space-y-[20px]">
                  <div className="px-[20px] sm:px-6 lg:px-8">
                    <div className="ui-item-grid ui-item-label font-semibold">
                      <div className="text-right pr-[12px] translate-y-[20px]">מק״ט</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">פירוט</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">כמות</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">מחיר ליחידה</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">מטבע</div>
                      {vatRate > 0 ? (
                        <div className="text-right pr-[12px] translate-y-[20px]">מע״מ</div>
                      ) : (
                        <div className="ti-items-only-desktop text-right opacity-0 pr-[12px] translate-y-[20px]" aria-hidden="true">
                          מע״מ
                        </div>
                      )}
                      <div className="text-right pr-[12px] translate-y-[20px]" ref={headerTotalRef}>
                        סה״כ
                      </div>
                      <div className="text-right pr-[50px] translate-y-[20px] ui-items-actions-label-offset">
                        אישור
                      </div>
                    </div>
                  </div>
                  {items.map((row, i) => (
                    <div key={i}>
                      <div
                        className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 ti-items-row"
                        data-payment-card="true"
                        data-locked={confirmedRows.has(i) ? "true" : "false"}
                      >
                        <div className="min-w-0">
                          <div className="ui-item-grid items-center">
                            <div className="ti-items-group ti-items-group--sku-desc">
                              <div className="ti-items-field" data-label="מק״ט">
                                <Input
                                  value={row.sku}
                                  onChange={(e) => updateItemRow(i, { sku: e.target.value })}
                                  className="ti-items-input text-right min-w-0"
                                  disabled={confirmedRows.has(i)}
                                />
                              </div>
                              <div className="ti-items-field" data-label="פירוט">
                                <Input
                                  value={row.description}
                                  onChange={(e) => {
                                    updateItemRow(i, { description: e.target.value });
                                    if (itemErrors[i]?.description && e.target.value.trim().length > 0) {
                                      const next = { ...itemErrors };
                                      if (next[i]) {
                                        delete next[i].description;
                                        if (Object.keys(next[i]).length === 0) delete next[i];
                                      }
                                      setItemErrors(next);
                                    }
                                  }}
                                  placeholder="פירוט"
                                  className={cn(
                                    "ti-items-input text-right min-w-0",
                                    itemErrors[i]?.description ? "border-danger focus-visible:ring-danger" : ""
                                  )}
                                  disabled={confirmedRows.has(i)}
                                />
                              </div>
                              <div className="ti-items-field" data-label="כמות">
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={Number.isFinite(row.quantity) ? row.quantity : ""}
                                  onChange={(e) => {
                                    const value = Number(e.target.value || 0);
                                    updateItemRow(i, { quantity: value });
                                    if (itemErrors[i]?.quantity && value > 0) {
                                      const next = { ...itemErrors };
                                      if (next[i]) {
                                        delete next[i].quantity;
                                        if (Object.keys(next[i]).length === 0) delete next[i];
                                      }
                                      setItemErrors(next);
                                    }
                                  }}
                                  className={cn(
                                    "ti-items-input text-right min-w-0",
                                    itemErrors[i]?.quantity ? "border-danger focus-visible:ring-danger" : ""
                                  )}
                                  inputMode="numeric"
                                  disabled={confirmedRows.has(i)}
                                />
                              </div>
                            </div>

                            <div className="ti-items-group ti-items-group--qty-price-currency">
                              <div className="ti-items-currency-amount">
                                <div className="ti-items-field ti-items-amount min-w-0" data-label="מחיר ליחידה">
                                  <MoneyInput
                                    className={cn(
                                      "w-full min-w-0 text-right",
                                      itemErrors[i]?.unitPrice ? "border-danger focus-visible:ring-danger" : "",
                                      confirmedRows.has(i) ? "pointer-events-none" : ""
                                    )}
                                    variant="items"
                                    value={row.unitPrice}
                                    onChange={(v) => {
                                      updateItemRow(i, { unitPrice: v });
                                      if (itemErrors[i]?.unitPrice && v > 0) {
                                        const next = { ...itemErrors };
                                        if (next[i]) {
                                          delete next[i].unitPrice;
                                          if (Object.keys(next[i]).length === 0) delete next[i];
                                        }
                                        setItemErrors(next);
                                      }
                                    }}
                                    currency={currency}
                                  />
                                </div>
                                <div className="ti-items-field ti-items-currency ti-items-hide-label min-w-0" data-label="מטבע">
                                  <Select
                                    value={row.currency || currency}
                                    disabled={currency !== "ILS" || confirmedRows.has(i)}
                                    onValueChange={(v) => updateItemRow(i, { currency: v })}
                                  >
                                    <SelectTrigger
                                      variant="underline"
                                      className={cn(
                                        "ti-items-select w-full min-w-0",
                                        itemErrors[i]?.currency ? "border-danger focus:border-danger" : ""
                                      )}
                                      aria-label="מטבע"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allowedCurrencies.map((c) => (
                                        <SelectItem key={c} value={c}>
                                          {currencySymbol(c)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <div className={cn("ti-items-group ti-items-group--vat-total", vatRate === 0 ? "ti-items-group--vat-hidden" : "")}>
                              {vatRate > 0 ? (
                                <div className="ti-items-field" data-label="מע״מ">
                                  <Select
                                    value={row.vatMode}
                                    disabled={confirmedRows.has(i)}
                                    onValueChange={(v) => updateItemRow(i, { vatMode: v as any })}
                                  >
                                    <SelectTrigger
                                      variant="underline"
                                      className="ti-items-select w-full min-w-0"
                                      aria-label="מע״מ"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="before">לפני</SelectItem>
                                      <SelectItem value="included">כולל</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <div className="ti-items-field ti-items-field-empty ti-items-only-desktop" aria-hidden="true">
                                  <div className="h-[50px]" />
                                </div>
                              )}
                            </div>

                            <div className="ti-items-group ti-items-group--total-actions">
                              <div className="ti-items-field ti-items-total-display" data-label="סה״כ">
                                <div
                                  className="text-right text-[18px] font-regular whitespace-nowrap"
                                  ref={(el) => {
                                    if (i === 0) itemTotalRef.current = el;
                                  }}
                                >
                                  {formatMoney(getLineTotal(row), row.currency || currency)}
                                </div>
                              </div>

                              <div
                                className="ti-items-field ti-items-actions ti-items-hide-label flex items-center justify-end gap-2 ui-items-actions-offset"
                                data-label="אישור"
                              >
                                {confirmedRows.has(i) ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setConfirmedRows((prev) => {
                                          const next = new Set(prev);
                                          next.delete(i);
                                          return next;
                                        })
                                      }
                                      aria-label="עריכה"
                                      className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button type="button" variant="default" onClick={() => confirmItemRow(i)}>
                                    אישור
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeItemRow(i)}
                                  disabled={items.length === 1}
                                  title={items.length === 1 ? "חייב להיות לפחות פריט אחד" : "מחיקה"}
                                  aria-label="מחיקה"
                                  className="text-danger hover:text-danger hover:bg-danger/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {i < items.length - 1 ? (
                        <div className="h-px bg-[var(--muted-fg)] opacity-50 mx-[20px] sm:mx-6 lg:mx-8 mt-[15px]" />
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex items-start justify-between gap-6">
                  <div className="shrink-0 pr-[25px]" ref={addItemButtonRef}>
                    <Button type="button" onClick={addItemRow} variant="secondary">
                      הוספת פריט
                    </Button>
                  </div>

                  {hasConfirmedItems ? (
                    <div className="pt-[50px] mt-[-16px] flex-1 ml-[110px]" ref={summaryOuterRef}>
                      <div className="px-[20px] sm:px-6 lg:px-8">
                        <div className="ui-item-grid" ref={summaryBlockRef}>
                          <div className="col-span-8 self-start text-right text-[24px]   text-fg">
                            <div
                              className="ui-item-grid items-center"
                              ref={(el) => {
                                summaryRowRefs.current[0] = el;
                              }}
                            >
                              <div className="col-span-4" />
                            <div
                              className="col-span-2 text-right whitespace-nowrap"
                              ref={(el) => {
                                summaryLabelRefs.current[0] = el;
                              }}
                            >
                              סה״כ לפני מע״מ
                            </div>
                            <div
                              className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                              ref={(el) => {
                                summaryValueContainerRefs.current[0] = el;
                              }}
                            >
                                <span
                                className="inline-block w-full text-right"
                                  ref={(el) => {
                                    summaryValueRefs.current[0] = el;
                                  }}
                                >
                                  {formatMoney(subtotal, currency)}
                                </span>
                              </div>
                              <div />
                            </div>
                            {vatRate > 0 ? (
                            <div
                              className="ui-item-grid items-center mt-[12px]"
                                ref={(el) => {
                                  summaryRowRefs.current[1] = el;
                                }}
                              >
                                <div className="col-span-4" />
                                <div
                                  className="col-span-2 text-right whitespace-nowrap"
                                  ref={(el) => {
                                    summaryLabelRefs.current[1] = el;
                                  }}
                                >
                                  מע״מ ({vatRate}%)
                                </div>
                                <div
                                  className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                                  ref={(el) => {
                                    summaryValueContainerRefs.current[1] = el;
                                  }}
                                >
                                  <span
                                    className="inline-block w-full text-right"
                                    ref={(el) => {
                                      summaryValueRefs.current[1] = el;
                                    }}
                                  >
                                    {formatMoney(vatAmount, currency)}
                                  </span>
                                </div>
                                <div />
                              </div>
                            ) : null}
                          <div
                            className="ui-item-grid items-center mt-[12px] doc-totals-grand"
                            ref={(el) => {
                              summaryRowRefs.current[2] = el;
                            }}
                          >
                              <div className="col-span-4" />
                              <div
                                className="col-span-2 text-right whitespace-nowrap font-bold text-primary"
                                ref={(el) => {
                                  summaryLabelRefs.current[2] = el;
                                }}
                              >
                                סה״כ כולל מע״מ
                              </div>
                              <div
                                className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                                ref={(el) => {
                                  summaryValueContainerRefs.current[2] = el;
                                }}
                              >
                                <span
                                className="inline-block w-full text-right font-bold text-primary"
                                  ref={(el) => {
                                    summaryValueRefs.current[2] = el;
                                  }}
                                >
                                  {formatMoney(total, currency)}
                                </span>
                              </div>
                              <div />
                            </div>
                          </div>
                        </div>
                      </div>
                      {roundTotals && (
                        <p className="text-xs mt-2 text-right text-muted-foreground">
                          כולל עיגול לסכום סופי
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </FormSection>

            <FormSection title="פירוט תקבולים" description="">
              <div ref={paymentsTableRef} className="space-y-[10px]">
                {(Object.keys(paymentErrors).length > 0 ||
                  (showPaymentsApprovalWarning && unconfirmedPaymentRowIndices.length > 0)) && (
                  <div
                    style={{
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #9B0003",
                      borderRadius: "8px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "20px" }}>⚠️</span>
                      <span style={{ fontSize: "16px", fontWeight: 600, color: "#9B0003" }}>
                        {Object.keys(paymentErrors).length > 0
                          ? "יש לתקן את השדות המסומנים באדום"
                          : "יש לאשר את התקבולים לפני המשך"}
                      </span>
                    </div>
                    {showPaymentsApprovalWarning && unconfirmedPaymentRowIndices.length > 0 ? (
                      <div style={{ marginTop: "8px", fontSize: "14px", color: "#9B0003" }}>
                        יש {unconfirmedPaymentRowIndices.length} תקבולים שלא אושרו — לחץ/י על &quot;אישור&quot; בכל שורה
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="space-y-[20px]">
                  {/* Headers Row */}
                  <div className="px-[20px] sm:px-6 lg:px-8">
                    <div className="hidden md:grid md:grid-cols-[minmax(140px,20%)_minmax(120px,140px)_minmax(160px,200px)_minmax(96px,110px)_1fr_minmax(120px,160px)] gap-3 items-center font-semibold">
                      <div className="text-right pr-[20px] translate-y-[20px]">אמצעי תשלום</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">תאריך</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">סכום</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">מטבע</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">פרטים נוספים</div>
                      <div className="text-right pr-[105px] translate-y-[20px] ui-payments-actions-label-offset ml-[55px]">
                        פעולות
                      </div>
                    </div>
                  </div>

                  {payments.map((row, i) => (
                    <div key={i}>
                      <div
                        className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 ti-items-row"
                        data-payment-card="true"
                        data-locked={confirmedPayments.has(i) ? "true" : "false"}
                      >
                        <div className="min-w-0">
                          {/* Desktop View - Single Row Grid */}
                          <div className="hidden md:grid md:grid-cols-[minmax(140px,20%)_minmax(120px,140px)_minmax(160px,200px)_minmax(96px,110px)_1fr_minmax(120px,160px)] gap-3 items-center">
                            {/* אמצעי תשלום - 19.2% */}
                            <div className="w-full min-w-0">
                              <Select
                                value={row.method}
                                disabled={confirmedPayments.has(i)}
                                onValueChange={(v) => {
                                  updatePaymentRow(i, { method: v as any });
                                  if (paymentErrors[i]?.method) {
                                    const newErrors = { ...paymentErrors };
                                    if (newErrors[i]) {
                                      delete newErrors[i].method;
                                      if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                    }
                                    setPaymentErrors(newErrors);
                                  }
                                }}
                              >
                                <SelectTrigger
                                  variant="underline"
                                  className={cn(
                                    "ti-items-select w-full min-w-0",
                                    paymentErrors[i]?.method ? "border-danger focus:border-danger" : ""
                                  )}
                                  aria-label="אמצעי תשלום"
                                >
                                  <SelectValue placeholder="בחר..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {PAYMENT_METHODS.map((m) => (
                                    <SelectItem key={m} value={m}>
                                      {m}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* תאריך - 13% */}
                            <DateInput
                              id={`payment-date-${i}`}
                              value={row.date}
                              onChange={(v) => {
                                updatePaymentRow(i, { date: v });
                                const rowCur = String(row.currency || currency);
                                if (isFxScenario && rowCur !== "ILS" && row.fxRateSource !== "manual") {
                                  fetchFxRateForRow(i, rowCur, v);
                                }
                              }}
                              className="ti-items-input text-right min-w-0"
                              variant="items"
                              disabled={confirmedPayments.has(i)}
                            />

                            {/* סכום - 13% */}
                            <div className="relative min-w-0">
                              <MoneyInput
                                className={cn(
                                  "w-full min-w-0 text-right",
                                  isFxScenario &&
                                    confirmedPayments.has(i) &&
                                    String(row.currency || currency) !== "ILS"
                                    ? "pl-9"
                                    : "",
                                  confirmedPayments.has(i) ? "pointer-events-none" : ""
                                )}
                                error={!!paymentErrors[i]?.amount}
                                variant="items"
                                value={row.amount}
                                onChange={(v) => {
                                  updatePaymentRow(i, { amount: v });
                                  if (paymentErrors[i]?.amount && v > 0) {
                                    const newErrors = { ...paymentErrors };
                                    if (newErrors[i]) {
                                      delete newErrors[i].amount;
                                      if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                    }
                                    setPaymentErrors(newErrors);
                                  }
                                }}
                                currency={row.currency || currency}
                              />
                              {isFxScenario &&
                              confirmedPayments.has(i) &&
                              String(row.currency || currency) !== "ILS" ? (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2">
                                  <FxRateDialog
                                    baseCurrency={String(row.currency || "").toUpperCase()}
                                    rate={Number.isFinite(Number(row.fxRate)) ? Number(row.fxRate) : null}
                                    disabled={!!fxLoading[i]}
                                    onUpdateRate={(nextRate) => {
                                      updatePaymentRow(i, {
                                        fxRate: nextRate,
                                        fxRateSource: "manual",
                                        fxRateDate: row.fxRateDate || row.date || todayYmd(),
                                      });
                                      if (paymentErrors[i]?.amount) {
                                        setPaymentErrors((prev) => {
                                          const next = { ...prev }
                                          const rowErr = next[i]
                                          if (!rowErr) return prev
                                          const cloned = { ...rowErr }
                                          delete cloned.amount
                                          if (Object.keys(cloned).length === 0) delete next[i]
                                          else next[i] = cloned as any
                                          return next
                                        })
                                      }
                                    }}
                                  />
                                </div>
                              ) : null}
                            {fxApiErrors[i] ? (
                              <div className="absolute right-0 top-full mt-1 text-right text-[14px] text-danger">
                                {fxApiErrors[i]}
                              </div>
                            ) : null}
                            </div>

                            {/* מטבע */}
                            <Select
                              value={row.currency || currency}
                              disabled={!isFxScenario || confirmedPayments.has(i)}
                              onValueChange={(v) => {
                                const next = String(v || "").toUpperCase().trim();
                                setPayments((prev) =>
                                  prev.map((r, idx) =>
                                    idx === i
                                      ? {
                                          ...r,
                                          currency: next,
                                          fxRate: undefined,
                                          fxRateDate: undefined,
                                          fxRateSource: undefined,
                                        }
                                      : r
                                  )
                                );
                                if (isFxScenario && next !== "ILS") {
                                  fetchFxRateForRow(i, next, row.date || documentDate || todayYmd());
                                }
                              }}
                            >
                              <SelectTrigger
                                variant="underline"
                                className={cn(
                                  "ti-items-select w-full min-w-0",
                                  paymentErrors[i]?.amount
                                    ? "border-[color:var(--field-border-error)] focus:border-[color:var(--field-border-error)]"
                                    : ""
                                )}
                                aria-label="מטבע"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {allowedCurrencies.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {currencySymbol(c)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* פרטים נוספים - flex-1 */}
                            <div className="min-w-0">
                              <PaymentDetailsSection
                                payment={row}
                                onUpdate={(updates) => updatePaymentRow(i, updates)}
                                isConfirmed={confirmedPayments.has(i)}
                                renderMode="inline"
                              />
                            </div>

                            {/* כפתורים - 1fr */}
                            <div className="flex items-center justify-center gap-2">
                              {confirmedPayments.has(i) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setConfirmedPayments((prev) => {
                                      const next = new Set(prev);
                                      next.delete(i);
                                      return next;
                                    })
                                  }
                                  aria-label="עריכה"
                                  className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="default"
                                  onClick={() => confirmPaymentRow(i)}
                                  disabled={!!fxLoading[i]}
                                >
                                  אישור
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePaymentRow(i)}
                                disabled={payments.length === 1}
                                title={payments.length === 1 ? "חייב להיות לפחות תקבול אחד" : "מחיקה"}
                                aria-label="מחיקה"
                                className="text-danger hover:text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Mobile View - Stack (only for mobile) */}
                          <div className="md:hidden space-y-4">
                            {/* אמצעי תשלום */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">אמצעי תשלום</label>
                              <Select
                                value={row.method}
                                disabled={confirmedPayments.has(i)}
                                onValueChange={(v) => {
                                  updatePaymentRow(i, { method: v as any });
                                  if (paymentErrors[i]?.method) {
                                    const newErrors = { ...paymentErrors };
                                    if (newErrors[i]) {
                                      delete newErrors[i].method;
                                      if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                    }
                                    setPaymentErrors(newErrors);
                                  }
                                }}
                              >
                                <SelectTrigger
                                  variant="underline"
                                  className={cn(
                                    "ti-items-select w-full",
                                    paymentErrors[i]?.method ? "border-danger focus:border-danger" : ""
                                  )}
                                  aria-label="אמצעי תשלום"
                                >
                                  <SelectValue placeholder="בחר..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {PAYMENT_METHODS.map((m) => (
                                    <SelectItem key={m} value={m}>
                                      {m}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* תאריך */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">תאריך תשלום</label>
                              <DateInput
                                id={`payment-date-mobile-${i}`}
                                value={row.date}
                                onChange={(v) => {
                                  updatePaymentRow(i, { date: v });
                                  const rowCur = String(row.currency || currency);
                                  if (isFxScenario && rowCur !== "ILS" && row.fxRateSource !== "manual") {
                                    fetchFxRateForRow(i, rowCur, v);
                                  }
                                }}
                                className="ti-items-input text-right w-full"
                                variant="items"
                                disabled={confirmedPayments.has(i)}
                              />
                            </div>

                            {/* סכום + מטבע - ביחד במובייל */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">סכום</label>
                              <div className="flex gap-3 items-center">
                                <MoneyInput
                                  className={cn(
                                    "w-full text-right",
                                    confirmedPayments.has(i) ? "pointer-events-none" : ""
                                  )}
                                  error={!!paymentErrors[i]?.amount}
                                  variant="items"
                                  value={row.amount}
                                  onChange={(v) => {
                                    updatePaymentRow(i, { amount: v });
                                    if (paymentErrors[i]?.amount && v > 0) {
                                      const newErrors = { ...paymentErrors };
                                      if (newErrors[i]) {
                                        delete newErrors[i].amount;
                                        if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                      }
                                      setPaymentErrors(newErrors);
                                    }
                                  }}
                                  currency={row.currency || currency}
                                />

                                <Select
                                  value={row.currency || currency}
                                  disabled={!isFxScenario || confirmedPayments.has(i)}
                                  onValueChange={(v) => {
                                    const next = String(v || "").toUpperCase().trim();
                                    setPayments((prev) =>
                                      prev.map((r, idx) =>
                                        idx === i
                                          ? {
                                              ...r,
                                              currency: next,
                                              fxRate: undefined,
                                              fxRateDate: undefined,
                                              fxRateSource: undefined,
                                            }
                                          : r
                                      )
                                    );
                                    if (isFxScenario && next !== "ILS") {
                                      fetchFxRateForRow(i, next, row.date || documentDate || todayYmd());
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    variant="underline"
                                    className={cn(
                                      "ti-items-select ti-payments-currency w-[80px] shrink-0",
                                      paymentErrors[i]?.amount
                                        ? "border-[color:var(--field-border-error)] focus:border-[color:var(--field-border-error)]"
                                        : ""
                                    )}
                                    aria-label="מטבע"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allowedCurrencies.map((c) => (
                                      <SelectItem key={c} value={c}>
                                        {currencySymbol(c)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {isFxScenario && String(row.currency || currency) !== "ILS" ? (
                                  <FxRateDialog
                                    baseCurrency={String(row.currency || "").toUpperCase()}
                                    rate={Number.isFinite(Number(row.fxRate)) ? Number(row.fxRate) : null}
                                    disabled={!!fxLoading[i]}
                                    onUpdateRate={(nextRate) => {
                                      updatePaymentRow(i, {
                                        fxRate: nextRate,
                                        fxRateSource: "manual",
                                        fxRateDate: row.fxRateDate || row.date || todayYmd(),
                                      });
                                      if (paymentErrors[i]?.amount) {
                                        setPaymentErrors((prev) => {
                                          const next = { ...prev }
                                          const rowErr = next[i]
                                          if (!rowErr) return prev
                                          const cloned = { ...rowErr }
                                          delete cloned.amount
                                          if (Object.keys(cloned).length === 0) delete next[i]
                                          else next[i] = cloned as any
                                          return next
                                        })
                                      }
                                    }}
                                  />
                                ) : null}
                              </div>
                              {fxApiErrors[i] ? (
                                <div className="mt-1 text-right text-[14px] text-danger">
                                  {fxApiErrors[i]}
                                </div>
                              ) : null}
                            </div>

                            {/* פרטים נוספים */}
                            {row.method && (
                              <div className="w-full">
                                <label className="block text-sm text-muted-fg mb-2">פרטים נוספים</label>
                                <PaymentDetailsSection
                                  payment={row}
                                  onUpdate={(updates) => updatePaymentRow(i, updates)}
                                  isConfirmed={confirmedPayments.has(i)}
                                  renderMode="inline"
                                />
                              </div>
                            )}

                            {/* כפתורים */}
                            <div className="flex items-center justify-end gap-2 pt-2">
                              {confirmedPayments.has(i) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setConfirmedPayments((prev) => {
                                      const next = new Set(prev);
                                      next.delete(i);
                                      return next;
                                    })
                                  }
                                  aria-label="עריכה"
                                  className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="default"
                                  onClick={() => confirmPaymentRow(i)}
                                  disabled={!!fxLoading[i]}
                                >
                                  אישור
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePaymentRow(i)}
                                disabled={payments.length === 1}
                                title={payments.length === 1 ? "חייב להיות לפחות תקבול אחד" : "מחיקה"}
                                aria-label="מחיקה"
                                className="text-danger hover:text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {i < payments.length - 1 ? (
                        <div className="h-px bg-[var(--muted-fg)] opacity-50 mx-[20px] sm:mx-6 lg:mx-8 mt-[15px]" />
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="pr-[25px]">
                  <Button type="button" onClick={addPaymentRow} variant="secondary">
                    הוספת תקבול
                  </Button>
                </div>

                {hasConfirmedPayments && (
                  <div className="pt-[50px] mt-[50px]">
                    <div className="flex justify-between items-center">
                      <div className="text-lg font-bold" style={{ color: "#19183B" }}></div>
                      <div className="text-2xl font-bold  ml-[50px]" style={{ color: "#19183B" }}>
                        סה״כ {formatMoney(paymentsTotal, currency)}
                      </div>
                    </div>
                    {roundTotals && (
                      <p className="text-xs mt-2 text-right" style={{ color: "#19183B", opacity: 0.8 }}>
                        כולל עיגול לסכום סופי
                      </p>
                    )}
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title="הערות">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px]  border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                  <FloatingTextarea
                    label="הערות שיופיעו במסמך"
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    containerClassName="w-full min-w-0"
                    className="min-h-[100px] resize-y"
                  />

                  <FloatingTextarea
                    label="הערות שיופיעו בגוף המייל"
                    id="emailNotes"
                    value={emailNotes}
                    onChange={(e) => setEmailNotes(e.target.value)}
                    containerClassName="w-full min-w-0"
                    className="min-h-[100px] resize-y"
                  />
                </div>
              </div>
            </FormSection>

            <div className="mt-10 flex gap-4 justify-end">
              <Button
                variant="ghost"
                onClick={handlePreview}
                disabled={busy != null || !sequenceLocked}
                loading={busy === "preview"}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                תצוגה מקדימה
              </Button>

              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={busy != null}
                loading={busy === "draft"}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                שמירת טיוטה
              </Button>

              <Button
                variant="primary"
                onClick={handleIssueConfirmation}
                disabled={busy != null || !sequenceLocked}
                loading={busy === "issue"}
                className="flex items-center gap-2"
              >
                הפקת מסמך
              </Button>
            </div>
          </form>

          {message && (
            <Card
              className={cn(
                "mt-[50px]",
                message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
              )}
            >
              <CardContent className="p-4">
                <div
                  className={cn(
                    "flex items-center gap-3 font-medium",
                    message.includes("שגיאה") ? "text-danger" : "text-success"
                  )}
                >
                  {message.includes("שגיאה") && "⚠️"}
                  {!message.includes("שגיאה") && "✓"}
                  <span>{message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <QuickAddCustomerModal
            isOpen={showQuickAddModal}
            onClose={() => setShowQuickAddModal(false)}
            onCustomerCreated={(customer) => {
              setCustomerName(customer.name);
              setCustomerId(customer.id);
              setMessage(`הלקוח "${customer.name}" נוסף בהצלחה ללקוחות שמורים`);
              setTimeout(() => setMessage(null), 3000);
            }}
            onSaveNameOnly={(name) => {
              setCustomerName(name);
              setCustomerId(null);
              setMessage("שם הלקוח נשמר למסמך זה בלבד (לא נוסף ללקוחות)");
              setTimeout(() => setMessage(null), 3000);
            }}
            prefillName={customerName}
          />

          {showStartingNumberModal && (
            <StartingNumberModal
              documentType="invoiceReceipt"
              // Closing (X / ביטול) only dismisses the modal and stays on the page.
              onClose={() => {
                setShowStartingNumberModal(false);
              }}
              onSuccess={() => {
                setShowStartingNumberModal(false);
                setSequenceLocked(true);
                window.location.reload();
              }}
            />
          )}

          <ReceiptPreviewModal
            isOpen={previewModalOpen}
            onClose={() => setPreviewModalOpen(false)}
            pdfUrl={previewPdfUrl || undefined}
            isLoading={busy === "preview"}
            error={previewError}
          />

          <ReceiptConfirmationModal
            isOpen={confirmationModalOpen}
            onClose={() => {
              if (isFinalizing) return;
              setConfirmationModalOpen(false);
            }}
            onConfirm={handleIssueConfirm}
            documentType="invoiceReceipt"
            documentDate={documentDate}
            customerName={customerName}
            total={total}
            currency={currency}
            isLoading={busy === "issue" || isFinalizing}
            hasEmail={false}
            isFinalizing={isFinalizing}
            consentState={undefined}
            consentChecked={undefined}
            onConsentCheckedChange={undefined}
            onRevokeConsent={undefined}
          />

          {successModalData && (
            <ReceiptSuccessModal
              isOpen={successModalOpen}
              onClose={() => {
                window.location.href = basePath === "/dashboard/documents" ? "/dashboard" : basePath;
              }}
              documentNumber={successModalData.documentNumber}
              companyName={successModalData.companyName}
              documentTypeLabel={successModalData.documentTypeLabel}
              documentId={successModalData.documentId}
              baseLanguage={successModalData.language}
              onViewDocument={async () => {
                window.location.href = `${basePath}/invoice-receipt/${successModalData.documentId}/summary`;
              }}
              onDownloadHebrew={async (opts) => {
                try {
                  const issue = opts?.issue || "copy";
                  const pdfUrl = `/api/documents/${successModalData.documentId}/pdf?lang=he&issue=${issue}`;
                  const response = await fetch(pdfUrl);

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.details || errorData.error || response.statusText;
                    throw new Error(`PDF download failed: ${errorMessage}`);
                  }

                  const blob = await response.blob();
                  if (blob.size === 0) throw new Error("Downloaded PDF is empty");

                  const pdfBlob = new Blob([blob], { type: "application/pdf" });
                  const url = window.URL.createObjectURL(pdfBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-he.pdf`;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  toast.success("הקובץ הורד בהצלחה");
                } catch (error: any) {
                  console.error("Hebrew PDF download failed:", error);
                  toast.error(error.message || "שגיאה בהורדת PDF");
                }
              }}
              onDownloadEnglish={async (opts) => {
                try {
                  const issue = opts?.issue || "copy";
                  const pdfUrl = `/api/documents/${successModalData.documentId}/pdf?lang=en&issue=${issue}`;
                  const response = await fetch(pdfUrl);

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.details || errorData.error || response.statusText;
                    throw new Error(`PDF download failed: ${errorMessage}`);
                  }

                  const blob = await response.blob();
                  if (blob.size === 0) throw new Error("Downloaded PDF is empty");

                  const pdfBlob = new Blob([blob], { type: "application/pdf" });
                  const url = window.URL.createObjectURL(pdfBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-en.pdf`;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  toast.success("File downloaded successfully");
                } catch (error: any) {
                  console.error("English PDF download failed:", error);
                  toast.error(error.message || "Failed to download PDF");
                }
              }}
            />
          )}

          {/* Totals Mismatch Warning Modal */}
          <div
            className={cn(
              "fixed inset-0 z-50 flex items-center justify-center transition-all duration-200",
              mismatchWarningOpen ? "visible opacity-100" : "invisible opacity-0"
            )}
            onClick={() => setMismatchWarningOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />
            
            {/* Modal */}
            <div
              className="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
                    <span className="text-4xl">⚠️</span>
                  </div>
                </div>

                {/* Content */}
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-semibold text-fg">
                    שים לב
                  </h3>
                  <p className="text-base text-fg/80 leading-relaxed">
                    הסכום הכולל של השירותים והפריטים חייב להיות זהה לסכום התקבולים
                  </p>
                  
                  {/* Totals Display */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-fg">סה״כ פריטים (כולל מע״מ):</span>
                      <span className="font-semibold text-fg">{formatMoney(total, currency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-fg">סה״כ תקבולים:</span>
                      <span className="font-semibold text-fg">
                        {formatMoney(paymentsTotal, currency)}
                      </span>
                    </div>
                    <div className="h-px bg-muted my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-danger font-medium">הפרש:</span>
                      <span className="font-bold text-danger">
                        {formatMoney(
                          Math.abs(total - paymentsTotal),
                          currency
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Button */}
                <div className="mt-6">
                  <Button
                    onClick={() => setMismatchWarningOpen(false)}
                    className="w-full"
                    variant="default"
                  >
                    הבנתי
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
