"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  InitialDocumentCreateData,
  DocumentDraftPayload,
  DocumentIssueType,
} from "@/lib/documents/types";
import {
  issueDocumentAction,
  saveDocumentDraftAction,
  updateDocumentDraftAction,
  getDocumentForChainingAction,
} from "@/lib/documents/actions";
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
import { requiresCustomerTaxIdForAllocation } from "@/lib/documents/allocation-rules";
import {
  buildChainedPaymentLink,
  chainedTotalFromSource,
  sourceAppliedRounding,
  validateChainedAmount,
} from "@/lib/documents/chaining";

/** Form document types use camelCase; chaining labels are keyed by the DB spelling. */
function toDbDocumentTypeForChain(t: string): string {
  if (t === "invoiceReceipt") return "invoice_receipt";
  if (t === "creditNote") return "credit_note";
  if (t === "workOrder") return "work_order";
  if (t === "deliveryNote") return "delivery_note";
  if (t === "returnNote") return "return_note";
  if (t === "purchaseOrder") return "purchase_order";
  if (t === "selfInvoice") return "self_invoice";
  if (t === "selfCreditNote") return "self_credit_note";
  return t;
}
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingTextarea } from "@/components/ui/floating-textarea";
import { FloatingDateInput } from "@/components/ui/floating-date-input";
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
import { createDocumentLinkAction } from "@/lib/documents/actions";
import { SubscriptionBlockModal, type SubscriptionBlockKind } from "@/components/subscription/SubscriptionBlockModal";
import { currencySymbol } from "@/lib/currency/symbol";

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

function endOfMonthYmd(isoYmd: string): string {
  // Expect YYYY-MM-DD
  const parts = String(isoYmd || "").split("-");
  const year = Number(parts[0] || 0);
  const month = Number(parts[1] || 0); // 1-12
  if (!Number.isFinite(year) || !Number.isFinite(month) || year < 1900 || month < 1 || month > 12) {
    return isoYmd;
  }
  // Day 0 of next month gives last day of current month.
  const last = new Date(year, month, 0);
  const mm = String(month).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currencySymbol(currency || "ILS")}`;
}

export default function TaxInvoiceFormClient({
  initial,
  documentType = "tax_invoice",
  footerText,
  editData,
  draftId,
}: {
  initial: InitialDocumentCreateData;
  documentType?: DocumentIssueType;
  footerText?: string;
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
  } | null;
  draftId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentConfig = useMemo(() => getDocumentConfig(documentType), [documentType]);
  const documentLabel = documentConfig?.label || "חשבונית מס";
  const basePath = documentConfig?.category === "business" ? "/business/documents" : "/dashboard/documents";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showDueDate = documentType === "tax_invoice" || documentType === "deliveryNote";

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const effectiveDraftId = useMemo(() => {
    if (draftId) return draftId
    if (initial.ok && initial.draftId) return initial.draftId
    return undefined
  }, [draftId, initial])

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["ILS", "USD", "EUR"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "ILS");
  // An osek patur is not registered for VAT: every document it issues is 0%,
  // and the server enforces that regardless of what the form sends.
  const vatExempt = initial.ok ? Boolean(initial.vatExempt) : false;
  const [vatType, setVatType] = useState<"regular" | "no_vat">(vatExempt ? "no_vat" : "regular");
  const defaultVatRate = useMemo(() => {
    if (vatExempt) return 0;
    const base = initial.ok ? initial.vatRate ?? 18 : 18;
    return Number.isFinite(base) ? base : 18;
  }, [initial, vatExempt]);
  const vatRate = vatExempt || vatType === "no_vat" ? 0 : defaultVatRate;

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState(endOfMonthYmd(todayYmd()));
  const [dueDateAuto, setDueDateAuto] = useState(true);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [customerTaxIdError, setCustomerTaxIdError] = useState<string | null>(null);
  const [chainSourceDocumentId, setChainSourceDocumentId] = useState<string | null>(null);
  /** Source total — the ceiling a chained document may not charge above. */
  const [chainSourceTotal, setChainSourceTotal] = useState<number | null>(null);
  const [itemErrors, setItemErrors] = useState<{
    [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string };
  }>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState("");

  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const customerTaxIdRef = useRef<HTMLDivElement>(null);
  const itemsTableRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<ItemRow[]>([
    { label: "", sku: "", description: "", quantity: 1, unitPrice: 0, currency, vatMode: "before" },
  ]);
  const [confirmedRows, setConfirmedRows] = useState<Set<number>>(new Set());
  const [showItemsApprovalWarning, setShowItemsApprovalWarning] = useState(false);

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [blockModalKind, setBlockModalKind] = useState<null | SubscriptionBlockKind>(null);

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
  const [shaamDecision, setShaamDecision] = useState<{
    open: boolean;
    errorId: string;
    documentId: string;
    payload: DocumentDraftPayload | null;
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
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  // Returning from the SHAAM OAuth round-trip. The draft was persisted before
  // the connect prompt, so everything the user entered is already reloaded by
  // the page's editData — all that is left is to tell them they can finish, and
  // to drop the one-shot marker from the URL so a refresh does not repeat it.
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

  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      if (typeof (editData as any).customerTaxId === "string") setCustomerTaxId((editData as any).customerTaxId);
      setDocumentDate(editData.documentDate);
      setDueDate(editData.paymentDueDate || editData.documentDate);
      setDueDateAuto(false);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      // A draft saved before the issuer was known to be VAT-exempt (or created
      // when the column default of 18 still applied) must not drag VAT back in.
      if (editData.vatType && !vatExempt) setVatType(editData.vatType);
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

          // Carry the customer and the description across. Only the item rows
          // were being applied, so a chained invoice opened with no customer and
          // no description even though the payload already contained both.
          setChainSourceTotal(chainedTotalFromSource(doc.totalAmount));
          if (doc.customerName) setCustomerName(String(doc.customerName));
          if (doc.customerId) setCustomerId(String(doc.customerId));
          // The ח.פ/ת.ז was not carried at all, so a chained invoice opened with
          // an empty customer ID — and above the statutory threshold that blocks
          // the allocation call outright.
          if (doc.customerTaxId) setCustomerTaxId(String(doc.customerTaxId).replace(/\D/g, ""));
          if (doc.documentDescription) setDescription(String(doc.documentDescription));
          // Carry the source's rounding. Without this the chained document
          // recomputes from the net base and lands on a different final amount
          // than the one actually issued (₪5,901 -> ₪5,901.18), which for a
          // regulated document must match to the agora.
          if (sourceAppliedRounding(doc)) setRoundTotals(true);
          // The association line is NOT written here. The chain is started from
          // the documents list, which already passes it as ?notes= in the format
          // "<target type> עבור <source type> <number>" — adding a second line
          // here produced two near-identical notes on the same document.
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
    if (!showDueDate) return;
    if (dueDateAuto) {
      const next = endOfMonthYmd(documentDate);
      if (next && next !== dueDate) setDueDate(next);
      return;
    }
    if (dueDate < documentDate) {
      setDueDate(documentDate);
    }
  }, [documentDate, dueDate, dueDateAuto, showDueDate]);

  // Leaves for the tax authority carrying the current document URL, so the
  // callback brings the user back here rather than to the settings screen.
  // The draft is already saved server-side, so nothing entered is lost.
  const goConnectShaam = useCallback(() => {
    const returnPath = buildDocumentReturnPath(effectiveDraftId);
    window.location.href = buildShaamConnectUrl(returnPath);
  }, [effectiveDraftId]);

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
  const hasConfirmedItems = confirmedRows.size > 0;
  const unconfirmedItemRowIndices = useMemo(() => {
    const out: number[] = [];
    items.forEach((_, idx) => {
      if (!confirmedRows.has(idx)) out.push(idx);
    });
    return out;
  }, [items, confirmedRows]);
  const allItemsConfirmed = items.length > 0 && unconfirmedItemRowIndices.length === 0;

  useEffect(() => {
    if (unconfirmedItemRowIndices.length === 0) setShowItemsApprovalWarning(false);
  }, [unconfirmedItemRowIndices.length]);

  const payload: DocumentDraftPayload = useMemo(() => {
    return {
      documentType,
      customerName,
      customerId,
      customerTaxId: customerTaxId.replace(/\D/g, "") || null,
      documentDate,
      paymentDueDate: showDueDate ? dueDate : "",
      description,
      payments: [],
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
    showDueDate,
    dueDate,
  ]);

  useEffect(() => {
    if (currency !== "ILS") {
      setItems((prev) => prev.map((item) => ({ ...item, currency })));
    }
  }, [currency]);



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

    if (!allItemsConfirmed) {
      setShowItemsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני תצוגה מקדימה");
      focusFieldWithError(itemsTableRef);
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
        paymentDueDate: showDueDate ? dueDate || documentDate || todayYmd() : "",
        description: description || "",
        notes: notes || "",
        footerNotes: footerText || "",
        total: total.toString() || "0",
        subtotal: subtotal.toString(),
        vatRate: vatRate.toString(),
        vatAmount: vatAmount.toString(),
        vatType: vatType,
        currency: currency || "₪",
        items: JSON.stringify(itemsForPreview),
      });

      const docIdForPreview = draftId || (editData as any)?.id || null;
      if (docIdForPreview) params.set("documentId", String(docIdForPreview));

      const routeSegment = documentConfig?.routeSegment || "tax-invoice";
      setPreviewPdfUrl(`${basePath}/${routeSegment}/preview?${params.toString()}`);
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

    setBusy("draft");
    try {
      let result;
      // For locked sequences, the server pre-creates a reserved draftId. Always update that draft if present.
      if (effectiveDraftId) result = await updateDocumentDraftAction(documentType, effectiveDraftId, payload);
      else result = await saveDocumentDraftAction(documentType, payload);

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
    if (!allItemsConfirmed) {
      setShowItemsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני הפקת מסמך");
      focusFieldWithError(itemsTableRef);
      return;
    }
    // Above the statutory threshold ITA requires an allocation number, which needs a
    // customer ID (ח.פ / ת.ז). Block here so a missing ID is an immediate inline field
    // error on the first click, not a round-trip to ITA that fails. The server remains
    // authoritative (global_settings > 5,000, strictly greater-than).
    //
    // Only tax_invoice / invoiceReceipt are in the allocation regime. This form is
    // shared with חשבון עסקה, הצעת מחיר, תעודת משלוח, הזמנת עבודה and the rest, which
    // never request an allocation number — demanding a customer ID from them was
    // asking for something that would never be used.
    if (
      requiresCustomerTaxIdForAllocation({ documentType, subtotalBeforeVat: subtotal }) &&
      customerTaxId.replace(/\D/g, "").length === 0
    ) {
      setCustomerTaxIdError("חובה למלא ח.פ/ת.ז של הלקוח לחשבונית מעל ₪5,000");
      toast.error("חובה למלא ח.פ/ת.ז של הלקוח לחשבונית מעל ₪5,000");
      focusFieldWithError(customerTaxIdRef);
      return;
    }
    // A chained document may settle its source in part or in full, never for
    // more: charging above the original is a new obligation and needs its own
    // document. Checked before the confirmation modal so nothing is issued.
    if (chainSourceDocumentId && chainSourceTotal !== null) {
      const cap = validateChainedAmount({ chainedTotal: total, sourceTotal: chainSourceTotal });
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

    if (!allItemsConfirmed) {
      setShowItemsApprovalWarning(true);
      toast.error("יש לאשר את כל השורות לפני הפקת מסמך");
      focusFieldWithError(itemsTableRef);
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

    // Recipient consent is not required for issuing.

    setBusy("issue");
    try {
      const result = await issueDocumentAction(documentType, payload, effectiveDraftId);

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

        // Only a document that actually collects money settles its source. An
        // invoice-receipt does; a plain tax invoice chained from a חשבון עסקה
        // does not — it restates the obligation rather than paying it, so it
        // stays a "related" link and leaves the source open.
        const settlesSource = documentType === "invoiceReceipt";

        const linkArgs = settlesSource
          ? buildChainedPaymentLink({
              sourceDocumentId: chainSourceDocumentId,
              chainedDocumentId: result.documentId,
              amount: total,
              note,
            })
          : {
              sourceDocumentId: chainSourceDocumentId,
              targetDocumentId: result.documentId,
              linkType: "related" as const,
              amount: 0,
              note,
            };

        const linkRes = await createDocumentLinkAction(linkArgs);
        if (!linkRes.ok) {
          toast.error(linkRes.message || "השרשור נכשל: לא ניתן ליצור קשר בין המסמכים");
        }
      }

      setSuccessModalData({
        documentId: result.documentId,
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: documentLabel,
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
              const retry = await issueDocumentAction(documentType, p, dId);
              setBusy(null);
              if (!retry || !retry.ok) {
                toast.error(retry?.message || "הפקת המסמך נכשלה לאחר המשך ללא מספר הקצאה");
                return;
              }
              setSuccessModalData({
                documentId: retry.documentId,
                documentNumber: retry.documentNumber || "",
                companyName: retry.companyName || "העסק שלי",
                documentTypeLabel: documentLabel,
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
              allowedVatTypes: vatExempt
                ? [{ value: "no_vat", label: "ללא מע״מ (עוסק פטור)", summaryLabel: "ללא מע״מ (עוסק פטור)" }]
                : [
                    { value: "regular", label: "כולל מע״מ", summaryLabel: "כולל מע״מ (ברירת מחדל)" },
                    { value: "no_vat", label: "ללא מע״מ (אילת / חו״ל)" },
                  ],
              canEdit: {
                currency: true,
                language: true,
                // An osek patur has no lawful "with VAT" option to choose.
                vatType: !vatExempt,
                roundTotals: true,
              },
            }}
            onChange={(patch) => {
              if (patch.currency !== undefined) setCurrency(patch.currency);
              if (patch.language !== undefined) setLanguage(patch.language as "he" | "en");
              if (patch.roundTotals !== undefined) setRoundTotals(patch.roundTotals);
              if (patch.vatType !== undefined && !vatExempt) setVatType(patch.vatType as "regular" | "no_vat");
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
                          // the invoice may need a different number than the record.
                          if (customer.tax_id) setCustomerTaxId(String(customer.tax_id));
                        }
                      }}
                      onAddNewCustomer={() => setShowQuickAddModal(true)}
                      placeholder="התחל להקליד שם לקוח..."
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <div ref={customerTaxIdRef}>
                    <FloatingInput
                      id="customerTaxId"
                      label="מספר עוסק / ח.פ של הלקוח"
                      value={customerTaxId}
                      error={customerTaxIdError}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setCustomerTaxId(digits);
                        if (customerTaxIdError && digits.length > 0) setCustomerTaxIdError(null);
                      }}
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
                      const next = minAllowedDate && value < minAllowedDate ? minAllowedDate : value;
                      setDocumentDate(next);
                      if (showDueDate && dueDateAuto) {
                        setDueDate(endOfMonthYmd(next));
                      }
                    }}
                    min={minAllowedDate || undefined}
                    containerClassName="w-full min-w-0 ui-document-date-offset"
                  />
                  {showDueDate ? (
                    <FloatingDateInput
                      label="תשלום עד"
                      required
                      id="dueDate"
                      value={dueDate}
                      onChange={(value) => {
                        setDueDateAuto(false);
                        if (value < documentDate) setDueDate(documentDate);
                        else setDueDate(value);
                      }}
                      min={documentDate || undefined}
                      containerClassName="w-full min-w-0 ui-document-date-offset"
                    />
                  ) : null}
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
                      <div className="text-right pr-[-50px] translate-y-[20px] ui-items-actions-label-offset">
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
              documentType={documentType}
              // Closing (X / ביטול) only dismisses the modal and stays put. It used to
              // navigate to basePath, which is /business/documents for business-category
              // documents — a route with no page.tsx, i.e. a 404.
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
            documentType={documentType}
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
                const target =
                  basePath === "/dashboard/documents"
                    ? "/dashboard"
                    : basePath === "/business/documents"
                      ? "/business/documents/new"
                      : basePath;
                window.location.href = target;
              }}
              documentNumber={successModalData.documentNumber}
              companyName={successModalData.companyName}
              documentTypeLabel={successModalData.documentTypeLabel}
              documentId={successModalData.documentId}
              baseLanguage={successModalData.language}
              onViewDocument={async () => {
                const routeSegment = documentConfig?.routeSegment || "tax-invoice";
                const target = `${basePath}/${routeSegment}/${successModalData.documentId}/summary`;
                window.location.href = target;
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
                  const downloadUrl = window.URL.createObjectURL(pdfBlob);
                  const link = document.createElement("a");
                  link.href = downloadUrl;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-he.pdf`;
                  link.download = fileName;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(downloadUrl);
                } catch (error: any) {
                  toast.error(`שגיאה בהורדת PDF: ${error.message}`);
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
                  const downloadUrl = window.URL.createObjectURL(pdfBlob);
                  const link = document.createElement("a");
                  link.href = downloadUrl;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-en.pdf`;
                  link.download = fileName;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(downloadUrl);
                } catch (error: any) {
                  toast.error(`שגיאה בהורדת PDF: ${error.message}`);
                }
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
