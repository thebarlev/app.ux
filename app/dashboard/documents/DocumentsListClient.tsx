"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { Card, CardContent } from "@/components/ui/card";
import { getAllDocumentsListAction, type DocumentsListFilters, type DocumentsListResult } from "./actions";
import { Eye, Download, GitBranchPlus, XCircle, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { selectUnderline } from "@/components/ui/field-styles";
import { currencySymbol } from "@/lib/currency/symbol";
import { cn } from "@/lib/utils";
import { getAllDocumentConfigs } from "@/lib/documents/document-configs";
import { closeDocumentAction } from "@/lib/documents/actions";
import ChainNewDocumentDialog, { type ChainNewDocumentKind } from "@/components/documents/ChainNewDocumentDialog";

const DOCUMENT_CONFIGS_BY_DB = new Map(
  getAllDocumentConfigs().map((config) => [config.dbValue, config])
);

function agentLogNav(payload: any) {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

type Props = {
  initialData: { ok: boolean; data?: DocumentsListResult; message?: string };
  initialFilters: DocumentsListFilters;
  listPathBase?: string;
  pageTitle?: string;
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
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol(curr)}`;
}

function getDocumentTypeLabel(type: string): string {
  const config = DOCUMENT_CONFIGS_BY_DB.get(type);
  return config?.label || type;
}

type UIStatus = "open" | "closed" | "canceling" | "canceled";

const ACCOUNTING_DOC_TYPES = new Set(["receipt", "tax_invoice", "invoice_receipt", "credit_note"]);

function computeUiStatus(doc: any): UIStatus {
  const ds = String(doc?.document_status || "").toLowerCase();
  const isDocCanceled = ds === "canceled" || ds === "cancelled" || ds === "void";
  const isCanceledByCredit = doc?.is_canceled_by_credit === true;
  const isCanceling =
    String(doc?.document_type || "").toLowerCase() === "credit_note" ||
    doc?.has_outgoing_credit_link === true;

  const total =
    typeof doc?.total_amount === "number" ? doc.total_amount : doc?.total_amount ? Number(doc.total_amount) : null;
  const outstanding =
    typeof doc?.outstanding_balance === "number"
      ? doc.outstanding_balance
      : doc?.outstanding_balance
        ? Number(doc.outstanding_balance)
        : null;
  const isFinal = ds === "final";

  // Priority: מבוטל > מבטל > סגור > פתוח
  if (isDocCanceled || isCanceledByCredit) return "canceled";
  if (isCanceling) return "canceling";

  if (typeof outstanding === "number" && Number.isFinite(outstanding)) {
    return outstanding <= 0 ? "closed" : "open";
  }

  // Fallback for docs without accounting fields: final => closed else open
  if (isFinal) return "closed";
  if (typeof total === "number" && total === 0) return "closed";
  return "open";
}

function getStatusBadgeFromUi(status: UIStatus): { label: string; style: CSSProperties } {
  switch (status) {
    case "open":
      return { label: "פתוח", style: { backgroundColor: "#E8F2FF", color: "#1D4ED8" } };
    case "closed":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } };
    case "canceling":
      return { label: "מבטל", style: { backgroundColor: "#F3E8FF", color: "#6D28D9" } };
    case "canceled":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } };
  }
}

function getStatusBadgeForDoc(docType: string, status: UIStatus): { label: string; style: CSSProperties } {
  const t = String(docType || "").toLowerCase();
  if (ACCOUNTING_DOC_TYPES.has(t)) {
    if (status === "canceled") return { label: "מבוטל", style: { backgroundColor: "#FDE8E8", color: "#B91C1C" } };
    if (status === "canceling") return { label: "מבטל", style: { backgroundColor: "#F3E8FF", color: "#6D28D9" } };
  }
  return getStatusBadgeFromUi(status);
}

function truncateDescription(description: string | null): string {
  if (!description || description.trim() === "") {
    return "—";
  }
  const trimmed = description.trim();
  if (trimmed.length <= 30) {
    return trimmed;
  }
  return trimmed.substring(0, 30) + " ...";
}

function truncateCustomerName(customerName: string | null): string {
  if (!customerName || customerName.trim() === "") {
    return "—";
  }
  const trimmed = customerName.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }
  return trimmed.substring(0, 22) + " ...";
}

export default function DocumentsListClient({ initialData, initialFilters, listPathBase, pageTitle }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openDocumentId = searchParams.get("open");
  const lastOpenedRef = useRef<string | null>(null);
  const effectiveListPathBase = listPathBase || "/dashboard/documents";
  const effectivePageTitle = pageTitle || "מסמכים";

  // Restrict document types by list category pages (income vs ongoing).
  // Important: These pages must never show/filter document types from the other category.
  const docTypeWhitelist = useMemo(() => {
    if (effectiveListPathBase.includes("/documents/income")) {
      return ["receipt", "tax_invoice", "credit_note", "invoice_receipt"] as const;
    }
    if (effectiveListPathBase.includes("/documents/ongoing")) {
      return [
        "quote",
        "proforma",
        "work_order",
        "delivery_note",
        "return_note",
        "purchase_order",
        "self_invoice",
        "self_credit_note",
      ] as const;
    }
    return null;
  }, [effectiveListPathBase]);
  const docTypeWhitelistSet = useMemo(() => (docTypeWhitelist ? new Set<string>(docTypeWhitelist) : null), [docTypeWhitelist]);
  const docTypeWhitelistCsv = useMemo(() => (docTypeWhitelist ? Array.from(docTypeWhitelist).join(",") : null), [docTypeWhitelist]);

  // Dev-only: allow QA to test multi-select UI even when the dataset currently contains only receipts.
  const SHOW_ALL_DOC_TYPES_FOR_TEST = process.env.NODE_ENV !== "production";
  const HIDDEN_DOC_TYPES = new Set(["invoiceReceipt", "invoice"]);
  const ALL_DOC_TYPES_FOR_TEST = [
    "receipt",
    "tax_invoice",
    "credit_note",
    "quote",
    "proforma",
    "work_order",
    "delivery_note",
    "return_note",
    "purchase_order",
    "self_invoice",
    "self_credit_note",
  ] as const;

  const [search, setSearch] = useState(initialFilters.search || "");
  const [documentType, setDocumentType] = useState(initialFilters.documentType || "all");

  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(() => {
    const raw = (initialFilters.documentType || "all").trim();
    if (!raw || raw === "all") return new Set();
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  });

  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const [closeConfirmDocumentId, setCloseConfirmDocumentId] = useState<string | null>(null);
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [cancelConfirmSource, setCancelConfirmSource] = useState<any | null>(null);
  const lastClosedDocumentIdRef = useRef<string | null>(null);
  const statusLogOnceRef = useRef<Set<string>>(new Set());

  const [isMobile, setIsMobile] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  type DateFilter =
    | { kind: "none"; label: string }
    | { kind: "preset"; preset: "last7" | "last30" | "last12mo"; dateFrom: string; dateTo: string; label: string }
    | { kind: "calendarYear"; year: number; dateFrom: string; dateTo: string; label: string }
    | { kind: "custom"; dateFrom: string; dateTo: string; label: string };

  const [dateFilter, setDateFilter] = useState<DateFilter>({ kind: "none", label: "טווח תאריכים" });
  // Custom range input values are displayed as DD/MM/YYYY (per UX spec)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Date range validation errors
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  const [clientData, setClientData] = useState<DocumentsListResult | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const searchFiltersCardRef = useRef<HTMLDivElement | null>(null);
  const searchFiltersGridRef = useRef<HTMLDivElement | null>(null);
  const searchFiltersItemSearchRef = useRef<HTMLDivElement | null>(null);
  const searchFiltersItemDocTypeRef = useRef<HTMLDivElement | null>(null);
  const searchFiltersItemDateRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  if (!initialData.ok) {
    return (
      <div className="ui-alert-danger">
        <div className="font-bold">שגיאה</div>
        <div className="mt-2">{initialData.message}</div>
      </div>
    );
  }

  const effectiveData = clientData || initialData.data!;
  useEffect(() => {
    const source = clientData ? "client" : "initial";
    const closedId = lastClosedDocumentIdRef.current;
    const closedDoc =
      closedId &&
      (clientData?.documents.find((doc) => doc.id === closedId) || initialData.data?.documents.find((doc) => doc.id === closedId));
  }, [clientData, dateFilter.kind, initialData.data]);
  const { documents, totalCount, page, pageSize, companyId } = effectiveData;
  const allVisibleIds = useMemo(() => documents.map((d) => d.id), [documents]);
  const isAllVisibleSelected = useMemo(() => {
    if (allVisibleIds.length === 0) return false;
    return allVisibleIds.every((id) => selectedDocuments.has(id));
  }, [allVisibleIds, selectedDocuments]);

  function toggleSelectAllVisible(nextChecked: boolean) {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (nextChecked) {
        for (const id of allVisibleIds) next.add(id);
      } else {
        for (const id of allVisibleIds) next.delete(id);
      }
      return next;
    });
  }

  function getRowStatusRaw(doc: any): UIStatus {
    return computeUiStatus(doc);
  }

  function goToCreditNoteForDocument(source: any) {
    if (!source?.customer_id) {
      alert("לא ניתן ליצור זיכוי: אין לקוח משוייך למסמך");
      return;
    }
    const label = getDocumentTypeLabel(source.document_type);
    const number = source.document_number || "";
    const description = `זיכוי עבור ${label} ${number}`.trim();

    const params = new URLSearchParams();
    params.set("customerId", source.customer_id);
    if (source.customer_name) params.set("customerName", String(source.customer_name));
    if (description) params.set("notes", description);
    params.set("sourceDocumentId", source.id);

    router.push(`/dashboard/documents/credit-note?${params.toString()}`);
  }

  function startCancellationFlow(source: any) {
    if (!source?.id) {
      alert("לא ניתן לבצע ביטול: חסר מזהה מסמך");
      return;
    }
    const status = computeUiStatus(source);
    if (status === "canceled" || status === "canceling") {
      alert("לא ניתן לבצע ביטול למסמך מבוטל או מבטל.");
      return;
    }
    const docType = String(source.document_type || "").toLowerCase();
    const label = getDocumentTypeLabel(source.document_type);
    const number = source.document_number || "";
    const noteText = `ביטול ${label} ${number}`.trim();

    const baseParams = new URLSearchParams();
    if (source.customer_id) baseParams.set("customerId", source.customer_id);
    if (source.customer_name) baseParams.set("customerName", String(source.customer_name));
    baseParams.set("sourceDocumentId", source.id);
    baseParams.set("notes", noteText);

    if (docType === "receipt") {
      baseParams.set("cancellation", "1");
      baseParams.set("description", noteText);
      const negativeReceiptUrl = `/dashboard/incomes/documents/new/receipt?${baseParams.toString()}`;
      router.push(negativeReceiptUrl);
      return;
    }

    if (docType === "tax_invoice") {
      const creditNoteUrl = `/dashboard/documents/credit-note?${baseParams.toString()}`;
      router.push(creditNoteUrl);
      return;
    }

    if (docType === "invoice_receipt") {
      const creditNoteUrl = `/dashboard/documents/credit-note?${baseParams.toString()}`;
      router.push(creditNoteUrl);
      return;
    }

    alert("ביטול מסמך זמין רק לחשבונית מס, חשבונית מס/קבלה או קבלה.");
  }

  function getCancellationIntroContent(source: any) {
    const docType = String(source?.document_type || "").toLowerCase();
    const label = getDocumentTypeLabel(source?.document_type);
    const number = source?.document_number || "";
    const titleBase = `${label} ${number}`.trim();

    if (docType === "tax_invoice") {
      return {
        title: `ביטול חשבונית מס ${number}`.trim(),
        description:
          "ביטול חשבונית מס מתבצע באמצעות הפקת חשבונית זיכוי. החשבונית המקורית תישמר במערכת לצורכי תיעוד וביקורת.",
        items: ["חשבונית זיכוי בסכום מלא", "קישור חשבונאי למסמך המקורי"],
        note: null,
        actionLabel: "הפקת חשבונית זיכוי",
      };
    }

    if (docType === "invoice_receipt") {
      return {
        title: `ביטול חשבונית מס / קבלה ${number}`.trim(),
        description:
          "ביטול חשבונית מס / קבלה מתבצע בשני שלבים חשבונאיים, כדי לבטל גם את המס וגם את התקבול.",
        items: [
          "חשבונית זיכוי – לביטול רכיב המס",
          "קבלה שלילית – לביטול התקבול",
          "שני המסמכים המקוריים יישמרו במערכת",
        ],
        note: "מדובר בפעולה חשבונאית תקנית בהתאם להנחיות רשות המסים.",
        actionLabel: "התחלת תהליך הביטול",
      };
    }

    if (docType === "receipt") {
      return {
        title: `ביטול קבלה ${number}`.trim(),
        description:
          "ביטול קבלה מתבצע באמצעות הפקת קבלה שלילית, הפעולה מבטלת את התקבול מבלי למחוק את הקבלה המקורית.",
        items: ["קבלה שלילית בסכום זהה", "קישור חשבונאי לקבלה המקורית"],
        note: null,
        actionLabel: "הפקת קבלה שלילית",
      };
    }

    return {
      title: `ביטול מסמך ${titleBase}`.trim(),
      description:
        "הפעולה חשבונאית, מתועדת ואינה מוחקת מסמכים. רק לאחר אישור תתחיל הפקת מסמכי הביטול הנדרשים.",
      items: [],
      note: null,
      actionLabel: "התחלת תהליך הביטול",
    };
  }

  function stripParenSuffix(label: string) {
    // e.g. "חשבון עסקה (דרישת תשלום)" -> "חשבון עסקה"
    return String(label || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  function chainToNewDocument(kind: ChainNewDocumentKind, source: any) {
    if (!source?.id) return;

    if (kind === "credit_note") {
      goToCreditNoteForDocument(source);
      return;
    }

    const targetLabel =
      kind === "deliveryNote"
        ? "תעודת משלוח"
        : kind === "tax_invoice"
          ? "חשבונית מס"
          : kind === "invoiceReceipt"
            ? "חשבונית מס / קבלה"
            : "קבלה";

    const sourceLabel = stripParenSuffix(getDocumentTypeLabel(source.document_type));
    const sourceNumber = source.document_number || "";
    const autoNotes = `${targetLabel} עבור ${sourceLabel} ${sourceNumber}`.trim();

    const params = new URLSearchParams();
    params.set("sourceDocumentId", source.id);
    if (source.customer_id) params.set("customerId", String(source.customer_id));
    if (source.customer_name) params.set("customerName", String(source.customer_name));
    if (autoNotes) params.set("notes", autoNotes);

    if (kind === "receipt") {
      router.push(`/dashboard/incomes/documents/new/receipt?${params.toString()}`);
      return;
    }
    if (kind === "invoiceReceipt") {
      router.push(`/dashboard/incomes/documents/new/invoiceReceipt?${params.toString()}`);
      return;
    }
    if (kind === "tax_invoice") {
      router.push(`/dashboard/incomes/documents/new/invoice?${params.toString()}`);
      return;
    }
    router.push(`/business/documents/new/deliveryNote?${params.toString()}`);
  }

  function shouldShowCancelFlowButton(doc: any): boolean {
    const t = String(doc?.document_type || "").toLowerCase();
    if (!(t === "tax_invoice" || t === "invoice_receipt" || t === "receipt")) return false;
    const status = computeUiStatus(doc);
    return status !== "canceled" && status !== "canceling";
  }

  function shouldShowCloseButton(documentType: string): boolean {
    const allowedTypes = [
      "quote",
      "proforma",
      "work_order",
      "delivery_note",
      "return_note",
      "purchase_order",
      "self_invoice",
      "self_credit_note",
    ];
    return allowedTypes.includes(documentType);
  }

  async function handleCloseDocument(documentId: string) {
    setCloseConfirmDocumentId(documentId);
  }

  async function confirmCloseDocument() {
    if (!closeConfirmDocumentId || closeConfirmLoading) return;
    setCloseConfirmLoading(true);
    const result = await closeDocumentAction(closeConfirmDocumentId);
    setCloseConfirmLoading(false);

    if (result.ok) {
      lastClosedDocumentIdRef.current = closeConfirmDocumentId;
      setCloseConfirmDocumentId(null);
      const df = "dateFrom" in dateFilter ? (dateFilter as any).dateFrom : null;
      const dt = "dateTo" in dateFilter ? (dateFilter as any).dateTo : null;
      void fetchWithDateFilter({ nextPage: page, nextDateFrom: df, nextDateTo: dt });
    } else {
      alert(result.message || "שגיאה בסגירת המסמך");
    }
  }

  function goToNewDocument(kind: "deliveryNote" | "tax_invoice" | "invoiceReceipt" | "receipt") {
    if (kind === "receipt") {
      router.push("/dashboard/incomes/documents/new/receipt");
      return;
    }
    if (kind === "invoiceReceipt") {
      router.push("/dashboard/incomes/documents/new/invoiceReceipt");
      return;
    }
    if (kind === "tax_invoice") {
      router.push("/dashboard/incomes/documents/new/invoice");
      return;
    }
    // delivery note is business category
    router.push("/business/documents/new/deliveryNote");
  }
  const totalPages = Math.ceil(totalCount / pageSize);
  const tableFontSize = "clamp(12px,1.2vw, 16px)";
  const tableHeaderColor = "#5389BB";
  const tableHeaderBorder = "1px solid #EDF1F5";

  const documentTypeOptions = useMemo(() => {
    // If we are in a dedicated category page (income/ongoing), show ONLY the whitelisted types.
    if (docTypeWhitelistSet) {
      return Array.from(docTypeWhitelistSet);
    }

    // Default page behavior: show types that exist in data,
    // but always include receipts so the option remains available even when list is empty.
    const set = new Set<string>(["receipt"]);
    for (const d of documents) {
      if (d?.document_type && !HIDDEN_DOC_TYPES.has(d.document_type)) {
        set.add(d.document_type);
      }
    }
    if (SHOW_ALL_DOC_TYPES_FOR_TEST) {
      for (const t of ALL_DOC_TYPES_FOR_TEST) {
        if (!HIDDEN_DOC_TYPES.has(t)) set.add(t);
      }
    }
    // Keep selected options visible even if current list is filtered and doesn't include them.
    for (const t of selectedDocTypes) {
      if (!HIDDEN_DOC_TYPES.has(t)) set.add(t);
    }
    return Array.from(set);
  }, [docTypeWhitelistSet, documents, selectedDocTypes, SHOW_ALL_DOC_TYPES_FOR_TEST]);

  const areAllDocTypesExplicitlySelected = useMemo(() => {
    if (selectedDocTypes.size === 0) return false;
    if (documentTypeOptions.length === 0) return false;
    return documentTypeOptions.every((t) => selectedDocTypes.has(t));
  }, [documentTypeOptions, selectedDocTypes]);

  // "All" is a true master checkbox:
  // - checked when every type is selected
  // - clicking toggles between "select all" and "clear all"
  // Filtering treats "clear all" as no filter (documentType="all") to avoid empty results.
  const isAllDocTypesSelected = areAllDocTypesExplicitlySelected;

  useEffect(() => {
    if (selectedDocTypes.size === 0 || isAllDocTypesSelected) {
      // On category pages, "all" means "all within the whitelist", not all system documents.
      if (docTypeWhitelistCsv) setDocumentType(docTypeWhitelistCsv);
      else setDocumentType("all");
    } else {
      setDocumentType(Array.from(selectedDocTypes).join(","));
    }
  }, [docTypeWhitelistCsv, isAllDocTypesSelected, selectedDocTypes]);


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

    const map = new Map<string, { key: string; label: string; docs: typeof documents }>();
    for (const doc of sorted) {
      const d = safeDate(doc);
      const year = d ? d.getFullYear() : 0;
      const month = d ? d.getMonth() + 1 : 0;
      const key = year && month ? `${year}-${String(month).padStart(2, "0")}` : "unknown";
      const label =
        key === "unknown"
          ? "ללא תאריך"
          : d!.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

      const existing = map.get(key);
      if (existing) {
        existing.docs.push(doc);
      } else {
        map.set(key, { key, label, docs: [doc] as any });
      }
    }

    // Keys already in descending order because we iterate sorted docs; preserve insertion order.
    return Array.from(map.values());
  }, [documents]);

  useEffect(() => {
    if (!openDocumentId || lastOpenedRef.current === openDocumentId) return;
    const doc = documents.find((d) => d.id === openDocumentId);
    if (!doc) return;
    router.push(`/dashboard/documents/${doc.id}`);
    lastOpenedRef.current = openDocumentId;
  }, [documents, openDocumentId]);

  function formatIsoDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDmyFromIso(iso: string): string {
    // expects YYYY-MM-DD
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  function isoFromDmy(dmy: string): string | null {
    // expects DD/MM/YYYY
    const parts = dmy.split("/");
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map((p) => p.trim());
    if (!dd || !mm || !yyyy) return null;
    if (yyyy.length !== 4) return null;
    const d = Number(dd);
    const m = Number(mm);
    const y = Number(yyyy);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    // basic validation only; server-side will enforce actual existence
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function formatRangeDmy(fromIso: string, toIso: string): string {
    return `${formatDmyFromIso(fromIso)} – ${formatDmyFromIso(toIso)}`;
  }

  function presetToRange(preset: "last7" | "last30" | "last12mo") {
    const today = new Date();
    const to = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const from = new Date(to);
    if (preset === "last7") from.setUTCDate(from.getUTCDate() - 6);
    if (preset === "last30") from.setUTCDate(from.getUTCDate() - 29);
    if (preset === "last12mo") from.setUTCFullYear(from.getUTCFullYear() - 1), from.setUTCDate(from.getUTCDate() + 1);
    return { dateFrom: formatIsoDate(from), dateTo: formatIsoDate(to) };
  }

  async function fetchWithDateFilter(opts: { nextPage: number; nextSearch?: string; nextDocumentType?: string; nextDateFrom: string | null; nextDateTo: string | null }) {
    setClientLoading(true);
    setClientError(null);
    try {
      const res = await getAllDocumentsListAction({
        search: opts.nextSearch ?? search,
        documentType: opts.nextDocumentType ?? documentType,
        documentStatusFilter: initialFilters.documentStatusFilter ?? "all",
        page: opts.nextPage,
        pageSize,
        dateFrom: opts.nextDateFrom || undefined,
        dateTo: opts.nextDateTo || undefined,
      });

      if (!res.ok || !res.data) {
        setClientError(res.message || "שגיאה בטעינת מסמכים");
        return;
      }

      const closedId = lastClosedDocumentIdRef.current;
      if (closedId) {
        const closedDoc = res.data.documents.find((doc) => doc.id === closedId);
      }

      setClientData(res.data);
    } finally {
      setClientLoading(false);
    }
  }

  async function downloadDocumentPdf(documentId: string, fileName: string) {
    const pdfUrl = `/api/documents/${documentId}/pdf`;
    const response = await fetch(pdfUrl, {
      headers: {
        Accept: "application/pdf",
      },
    });

    if (!response.ok) {
      const status = response.status;
      const contentType = response.headers.get("content-type") || "";
      let details: string | null = null;

      try {
        if (contentType.includes("application/json")) {
          const data = (await response.json()) as any;
          details =
            (typeof data?.message === "string" && data.message) ||
            (typeof data?.details === "string" && data.details) ||
            (typeof data?.error === "string" && data.error) ||
            null;
        } else {
          const text = await response.text();
          details = text?.trim() ? text.trim().slice(0, 200) : null;
        }
      } catch {
        // ignore parsing errors
      }

      const hint =
        status === 401
          ? " (אין הרשאה / ייתכן שפג תוקף ההתחברות)"
          : status === 404
            ? " (מסמך לא נמצא / PDF חסר)"
            : status === 400
              ? " (בקשה לא תקינה)"
              : "";

      throw new Error(details || `שגיאה בהורדת המסמך (${status})${hint}`);
    }
    // Prefer server-provided filename (already <documentNumber>-<lang>.pdf)
    const contentDisposition = response.headers.get("content-disposition") || "";
    const mQuoted = contentDisposition.match(/filename="([^"]+)"/i);
    const mStar = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    const serverFileName = mQuoted?.[1] || (mStar?.[1] ? decodeURIComponent(mStar[1]) : null);
    const finalFileName = serverFileName || fileName;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  function applyFilters() {
    if (dateFilter.kind !== "none") {
      const next = 1;
      const df = "dateFrom" in dateFilter ? dateFilter.dateFrom : null;
      const dt = "dateTo" in dateFilter ? dateFilter.dateTo : null;
      void fetchWithDateFilter({ nextPage: next, nextDateFrom: df, nextDateTo: dt });
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (documentType && documentType !== "all") params.set("documentType", documentType);
    params.set("page", "1");

    router.push(`${effectiveListPathBase}?${params.toString()}`);
  }

  function resetFilters() {
    setSearch("");
    setSelectedDocTypes(new Set());
    setDateFilter({ kind: "none", label: "טווח תאריכים" });
    setCustomFrom("");
    setCustomTo("");
    setClientData(null);
    setClientError(null);
    setClientLoading(false);
    router.push(effectiveListPathBase);
  }

  function goToPage(newPage: number) {
    if (dateFilter.kind !== "none") {
      const df = "dateFrom" in dateFilter ? dateFilter.dateFrom : null;
      const dt = "dateTo" in dateFilter ? dateFilter.dateTo : null;
      void fetchWithDateFilter({ nextPage: newPage, nextDateFrom: df, nextDateTo: dt });
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (documentType && documentType !== "all") params.set("documentType", documentType);
    params.set("page", newPage.toString());

    router.push(`${effectiveListPathBase}?${params.toString()}`);
  }

  function closeDatePickerUi() {
    setDateSheetOpen(false);
  }

  function applyDateFilter(next: DateFilter) {
    setDateFilter(next);
    setClientData(null);
    const df = "dateFrom" in next ? (next as any).dateFrom : null;
    const dt = "dateTo" in next ? (next as any).dateTo : null;
    void fetchWithDateFilter({ nextPage: 1, nextDateFrom: df, nextDateTo: dt });
    closeDatePickerUi();
  }

  function clearDateFilter() {
    setDateFilter({ kind: "none", label: "טווח תאריכים" });
    setCustomFrom("");
    setCustomTo("");
    setDateRangeError(null);
    setClientData(null);
    setClientError(null);
    setClientLoading(false);
    closeDatePickerUi();
  }

  const dateTriggerLabel = dateFilter.label;
  const customRangePreview =
    customFrom && customTo ? `${formatDmyFromIso(customFrom)} – ${formatDmyFromIso(customTo)}` : "DD/MM/YYYY – DD/MM/YYYY";

  return (
    <div
      className="ui-container pt-6 sm:pt-10 max-w-full sm:max-w-[1200px] px-0 sm:px-[2px] overflow-x-hidden"
      style={{ minHeight: "100vh" }}
    >
      {/* Page Header */}
      <div className="ui-page-header-sticky mb-8 sm:mb-[20px]">
        <h1 className="text-right mb-2 sm:mb-4">{effectivePageTitle}</h1>
        <p className="text-right">{totalCount} מסמכים סה״כ</p>
      </div>

      {/* Search Section */}
      <FormSection title="חיפוש וסינון">
        <div
          ref={searchFiltersCardRef}
          className="ui-docs-filters relative w-full max-w-full px-4 sm:px-6 lg:px-8 py-6 [&_input#search:focus]:bg-[var(--input)]"
          style={{
            backgroundColor: "white",
            borderRadius: "20px",
           /* boxShadow: "0 0 13px 0 rgba(0, 0, 0, 0.10)", */
            border: "none",
          }}
        >
          <div
            ref={searchFiltersGridRef}
            className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]"
          >
            <div ref={searchFiltersItemSearchRef} className="min-w-0">
              <FloatingInput
                label="חיפוש לפי מספר מסמך או שם לקוח"
                id="search"
                className="pt-0 pb-0 leading-[var(--field-line-height)]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyFilters();
                  }
                }}
                containerClassName="w-full min-w-0"
              />
            </div>

            <div ref={searchFiltersItemDocTypeRef} className="min-w-0">
              <FieldWrapper
                label="סוג מסמך"
                id="documentType"
                className="ui-field-block w-full min-w-0 -translate-y-[4px]"
                labelClassName="ui-select-label"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="secondary" className={cn("ui-dd-trigger", selectUnderline)}>
                      <span>
                        {selectedDocTypes.size === 0 || isAllDocTypesSelected
                          ? "כל המסמכים"
                          : selectedDocTypes.size === 1
                          ? Array.from(selectedDocTypes)[0] === "receipt"
                            ? "קבלות"
                            : getDocumentTypeLabel(Array.from(selectedDocTypes)[0])
                          : `${selectedDocTypes.size} סוגי מסמכים`}
                      </span>
                      <span>▾</span>
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    className="ui-dd-content min-w-[260px]"
                    style={{ direction: "rtl" }}
                    data-debug="docType-dd-content"
                  >
                    <DropdownMenuCheckboxItem
                      className="ui-dd-check"
                      checked={isAllDocTypesSelected}
                      onSelect={(e) => {
                        e.preventDefault();
                        setSelectedDocTypes(() => (isAllDocTypesSelected ? new Set() : new Set(documentTypeOptions)));
                      }}
                    >
                      <span className="ui-dd-check-label">כל המסמכים</span>
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuSeparator className="ui-dd-sep" />

                    {documentTypeOptions.map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t}
                        className="ui-dd-check"
                        checked={selectedDocTypes.has(t) || isAllDocTypesSelected}
                        onSelect={(e) => {
                          e.preventDefault();
                          setSelectedDocTypes((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) next.delete(t);
                            else next.add(t);
                            return next;
                          });
                        }}
                      >
                        <span className="ui-dd-check-label">{t === "receipt" ? "קבלות" : getDocumentTypeLabel(t)}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </FieldWrapper>
            </div>

            {/* Date range filter block */}
            <div ref={searchFiltersItemDateRef} className="min-w-0">
              <FieldWrapper
                label="טווח תאריכים"
                id="dateRange"
                className="ui-field-block w-full min-w-0 -translate-y-[4px]"
                labelClassName="ui-select-label"
              >
                {isMobile ? (
                  <Button
                    id="dateRange"
                    type="button"
                    variant="secondary"
                    onClick={() => setDateSheetOpen(true)}
                    className={cn("ui-dd-trigger", selectUnderline)}
                  >
                    <span>{dateTriggerLabel}</span>
                    <span>▾</span>
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button id="dateRange" type="button" variant="secondary" className={cn("ui-dd-trigger", selectUnderline)}>
                        <span>{dateTriggerLabel}</span>
                        <span>▾</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="ui-dd-content"
                      style={{
                        direction: "rtl",
                        maxWidth: "350px",
                        // SaaS tokens (local override only)
                        backgroundColor: "var(--input)",
                        borderColor: "var(--input-border)",
                        color: "var(--input-fg)",
                      }}
                    >
                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        const r = presetToRange("last7");
                        setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                        setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                        setDateRangeError(null); // Clear any validation errors
                        applyDateFilter({ kind: "preset", preset: "last7", ...r, label: "7 ימים אחרונים" });
                      }}
                    >
                      7 ימים אחרונים
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        const r = presetToRange("last30");
                        setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                        setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                        setDateRangeError(null); // Clear any validation errors
                        applyDateFilter({ kind: "preset", preset: "last30", ...r, label: "30 ימים אחרונים" });
                      }}
                    >
                      30 ימים אחרונים
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        const r = presetToRange("last12mo");
                        setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                        setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                        setDateRangeError(null); // Clear any validation errors
                        applyDateFilter({ kind: "preset", preset: "last12mo", ...r, label: "12 חודשים אחרונים" });
                      }}
                    >
                      12 חודשים אחרונים
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        const now = new Date();
                        const y = now.getFullYear();
                        const dateFrom = `${y}-01-01`;
                        const dateTo = `${y}-12-31`;
                        setCustomFrom(dateFrom); // Store in ISO format (YYYY-MM-DD)
                        setCustomTo(dateTo); // Store in ISO format (YYYY-MM-DD)
                        setDateRangeError(null); // Clear any validation errors
                        applyDateFilter({ kind: "calendarYear", year: y, dateFrom, dateTo, label: `שנה נוכחית (${y})` });
                      }}
                    >
                      שנה נוכחית
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        const now = new Date();
                        const y = now.getFullYear() - 1;
                        const dateFrom = `${y}-01-01`;
                        const dateTo = `${y}-12-31`;
                        setCustomFrom(dateFrom); // Store in ISO format (YYYY-MM-DD)
                        setCustomTo(dateTo); // Store in ISO format (YYYY-MM-DD)
                        setDateRangeError(null); // Clear any validation errors
                        applyDateFilter({ kind: "calendarYear", year: y, dateFrom, dateTo, label: `שנה קודמת (${y})` });
                      }}
                    >
                      שנה קודמת
                    </DropdownMenuItem>

                    <div className="px-2 pb-2 pt-1" dir="rtl">
                      <div className="flex justify-start">
                        <div className="grid w-[100%] grid-cols-2 gap-2">
                          <DateInput
                            className="h-[50px] !text-[18px]"
                            value={customFrom}
                            onChange={(newFromIso) => {
                              setCustomFrom(newFromIso);
                              setDateRangeError(null); // Clear error when user changes date

                              // If "to date" exists and is earlier than new "from date", clear it
                              if (customTo && newFromIso && customTo < newFromIso) {
                                setCustomTo("");
                                setDateRangeError(null);
                                return;
                              }

                              // Apply filter if both dates are valid
                              if (newFromIso && customTo) {
                                if (customTo < newFromIso) {
                                  setDateRangeError("תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה");
                                  return;
                                }
                                setDateRangeError(null);
                                applyDateFilter({
                                  kind: "custom",
                                  dateFrom: newFromIso,
                                  dateTo: customTo,
                                  label: `${formatDmyFromIso(newFromIso)} – ${formatDmyFromIso(customTo)}`,
                                });
                              }
                            }}
                            max={customTo || undefined}
                            style={{
                              borderColor: dateRangeError ? "#B91C1C" : undefined,
                              borderWidth: dateRangeError ? "2px" : undefined,
                            }}
                          />
                          <DateInput
                            className="h-[50px] !text-[18px]"
                            value={customTo}
                            onChange={(newToIso) => {
                              setCustomTo(newToIso);
                              setDateRangeError(null); // Clear error when user changes date

                              // Apply filter if both dates are valid
                              if (customFrom && newToIso) {
                                if (newToIso < customFrom) {
                                  setDateRangeError("תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה");
                                  return;
                                }
                                setDateRangeError(null);
                                applyDateFilter({
                                  kind: "custom",
                                  dateFrom: customFrom,
                                  dateTo: newToIso,
                                  label: `${formatDmyFromIso(customFrom)} – ${formatDmyFromIso(newToIso)}`,
                                });
                              }
                            }}
                            min={customFrom || undefined}
                            style={{
                              borderColor: dateRangeError ? "#B91C1C" : undefined,
                              borderWidth: dateRangeError ? "2px" : undefined,
                            }}
                          />
                        </div>
                      </div>
                      {dateRangeError && (
                        <div className="mt-2 text-right" style={{ color: "#B91C1C", fontSize: "14px" }}>
                          {dateRangeError}
                        </div>
                      )}
                    </div>

                    <DropdownMenuItem
                      className="ui-dd-item w-full !justify-start text-left cursor-pointer hover:!bg-[var(--dropdown-item-hover)] data-[highlighted]:!bg-[var(--dropdown-item-hover)]"
                      onSelect={(e) => {
                        e.preventDefault();
                        clearDateFilter();
                      }}
                    >
                      איפוס
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </FieldWrapper>
            </div>
          </div>

          <div className="mt-[50px] flex gap-3">
            <Button onClick={applyFilters} style={{ height: "50px", fontSize: "18px" }}>
              חפש
            </Button>
            <Button onClick={resetFilters} variant="secondary" style={{ height: "50px", fontSize: "18px" }}>
              איפוס
            </Button>
          </div>
        </div>
      </FormSection>

      {/* Mobile Date Sheet */}
      <Sheet open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
  <SheetContent
    side="bottom"
    dir="rtl"
    className="h-[80vh] rounded-t-xl bg-card text-card-fg text-right"
  >
    <SheetHeader>
      <SheetTitle className="ui-sheet-title">טווח תאריכים</SheetTitle>
    </SheetHeader>

    <div className="ui-sheet-body">
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const r = presetToRange("last7");
                  setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                  setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                  setDateRangeError(null); // Clear any validation errors
                  applyDateFilter({ kind: "preset", preset: "last7", ...r, label: "7 ימים אחרונים" });
                }}
                className="h-[50px] text-[18px] justify-end"
              >
                7 ימים אחרונים
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const r = presetToRange("last30");
                  setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                  setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                  setDateRangeError(null); // Clear any validation errors
                  applyDateFilter({ kind: "preset", preset: "last30", ...r, label: "30 ימים אחרונים" });
                }}
                className="h-[50px] text-[18px] justify-end"
              >
                30 ימים אחרונים
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const r = presetToRange("last12mo");
                  setCustomFrom(r.dateFrom); // Store in ISO format (YYYY-MM-DD)
                  setCustomTo(r.dateTo); // Store in ISO format (YYYY-MM-DD)
                  setDateRangeError(null); // Clear any validation errors
                  applyDateFilter({ kind: "preset", preset: "last12mo", ...r, label: "12 חודשים אחרונים" });
                }}
                className="h-[50px] text-[18px] justify-end"
              >
                12 חודשים אחרונים
              </Button>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  const dateFrom = `${y}-01-01`;
                  const dateTo = `${y}-12-31`;
                  setCustomFrom(dateFrom); // Store in ISO format (YYYY-MM-DD)
                  setCustomTo(dateTo); // Store in ISO format (YYYY-MM-DD)
                  setDateRangeError(null); // Clear any validation errors
                  applyDateFilter({ kind: "calendarYear", year: y, dateFrom, dateTo, label: `שנה נוכחית (${y})` });
                }}
                className="h-[50px] text-[18px] justify-end"
              >
                שנה נוכחית
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const now = new Date();
                  const y = now.getFullYear() - 1;
                  const dateFrom = `${y}-01-01`;
                  const dateTo = `${y}-12-31`;
                  setCustomFrom(dateFrom); // Store in ISO format (YYYY-MM-DD)
                  setCustomTo(dateTo); // Store in ISO format (YYYY-MM-DD)
                  setDateRangeError(null); // Clear any validation errors
                  applyDateFilter({ kind: "calendarYear", year: y, dateFrom, dateTo, label: `שנה קודמת (${y})` });
                }}
                className="h-[50px] text-[18px] justify-end"
              >
                שנה קודמת
              </Button>
            </div>

            <div className="mt-4 flex justify-start">
              <div className="grid w-[75%] grid-cols-1 gap-2">
                <DateInput
                  className="h-[50px] !text-[18px]"
                  value={customFrom}
                  onChange={(newFromIso) => {
                    setCustomFrom(newFromIso);
                    setDateRangeError(null); // Clear error when user changes date
                    
                    // If "to date" exists and is earlier than new "from date", clear it
                    if (customTo && newFromIso && customTo < newFromIso) {
                      setCustomTo("");
                      setDateRangeError(null);
                      return;
                    }
                    
                    // Apply filter if both dates are valid
                    if (newFromIso && customTo) {
                      if (customTo < newFromIso) {
                        setDateRangeError("תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה");
                        return;
                      }
                      setDateRangeError(null);
                      applyDateFilter({
                        kind: "custom",
                        dateFrom: newFromIso,
                        dateTo: customTo,
                        label: `${formatDmyFromIso(newFromIso)} – ${formatDmyFromIso(customTo)}`,
                      });
                    }
                  }}
                  max={customTo || undefined}
                  style={{
                    borderColor: dateRangeError ? "#B91C1C" : undefined,
                    borderWidth: dateRangeError ? "2px" : undefined,
                  }}
                />
                <DateInput
                  className="h-[50px] !text-[18px]"
                  value={customTo}
                  onChange={(newToIso) => {
                    setCustomTo(newToIso);
                    setDateRangeError(null); // Clear error when user changes date
                    
                    // Apply filter if both dates are valid
                    if (customFrom && newToIso) {
                      if (newToIso < customFrom) {
                        setDateRangeError("תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה");
                        return;
                      }
                      setDateRangeError(null);
                      applyDateFilter({
                        kind: "custom",
                        dateFrom: customFrom,
                        dateTo: newToIso,
                        label: `${formatDmyFromIso(customFrom)} – ${formatDmyFromIso(newToIso)}`,
                      });
                    }
                  }}
                  min={customFrom || undefined}
                  style={{
                    borderColor: dateRangeError ? "#B91C1C" : undefined,
                    borderWidth: dateRangeError ? "2px" : undefined,
                  }}
                />
                {dateRangeError && (
                  <div className="text-right" style={{ color: "#B91C1C", fontSize: "14px" }}>
                    {dateRangeError}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={clearDateFilter} className="h-[50px] w-full text-[18px] justify-end">
                איפוס
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Documents List */}
      <div className="mt-[50px]">
        <FormSection title="רשימת מסמכים">
          {clientError ? (
            <div className="ui-alert-danger mb-4">
              <div className="font-bold">שגיאה</div>
              <div className="mt-2">{clientError}</div>
            </div>
          ) : null}
          {/* Bulk Actions Bar */}
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
                {/* checkbox */}
                <col style={{ width: "36px" }} />
                {/* status */}
                <col style={{ width: "clamp(60px, 8vw, 44px)" }} />
                {/* number */}
                <col style={{ width: "clamp(55px, 7vw, 45px)" }} />
                {/* date */}
                <col style={{ width: "clamp(90px, 10vw, 80px)" }} />
                {/* doc type (narrower) */}
                <col style={{ width: "clamp(150px, 9vw, 120px)" }} />
                {/* customer (narrower) */}
                <col style={{ width: "clamp(190px, 16vw, 60px)" }} />
                {/* description (wider) */}
                <col style={{ width: "clamp(211px, 30vw, 210px)" }} />
                {/* amount */}
                <col style={{ width: "clamp(50px, 10vw, 140px)" }} />
                {/* actions */}
                <col style={{ width: "260px" }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: "#FFFFFF", borderBottom: tableHeaderBorder }}>
                  {/* Select-all */}
                  <th style={{ padding: "5px 3px", textAlign: "center", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected && allVisibleIds.length > 0}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      aria-label="בחר הכל"
                    />
                  </th>
                  <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סטטוס</th>
                  <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>מספר</th>
                  <th style={{ padding: "5px 4px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תאריך</th>
                  <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סוג המסמך</th>
                  <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>שם הלקוח</th>
                  <th style={{ padding: "5px 3px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תיאור</th>
                  <th style={{ padding: "5px 4px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סכום</th>
                  <th
                    className="docs-actions-cell"
                    style={{ padding: "6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}
                  >
                    <span className="docs-actions-shift">פעולות</span>
                  </th>
                </tr>
              </thead>
            </table>

            {/* Bulk Actions Bar (when rows selected) */}
            {selectedDocuments.size > 0 && (
              <div style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EDF1F5',
                borderRadius: '12px',
                padding: '16px',
                marginTop: '16px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                minWidth: '900px',
              }}>
                <div style={{ fontSize: '18px', color: '#19183B', fontWeight: 500 }}>
                  {selectedDocuments.size} מסמכים נבחרו
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        style={{ height: "40px", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}
                        disabled={selectedDocuments.size !== 1 || bulkDownloading}
                        title={selectedDocuments.size !== 1 ? "הפקה זמינה כרגע למסמך אחד בלבד" : "הפקת מסמך"}
                      >
                        הפקת מסמך ▾
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" style={{ direction: "rtl" }}>
                      <DropdownMenuLabel>הפקת מסמך</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); goToNewDocument("deliveryNote"); }}>
                        תעודת משלוח
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); goToNewDocument("tax_invoice"); }}>
                        חשבונית מס
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); goToNewDocument("invoiceReceipt"); }}>
                        חשבונית מס/קבלה
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); goToNewDocument("receipt"); }}>
                        קבלה
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    onClick={async () => {
                      if (bulkDownloading) return;
                      setBulkDownloading(true);
                      try {
                        const ids = Array.from(selectedDocuments);
                        for (const id of ids) {
                          const doc = documents.find((d) => d.id === id);
                          const fileName = `document-${doc?.document_number || id}.pdf`;
                          await downloadDocumentPdf(id, fileName);
                        }
                      } catch (error: any) {
                        alert(error?.message || "שגיאה בהורדת המסמכים");
                      } finally {
                        setBulkDownloading(false);
                      }
                    }}
                    variant="secondary"
                    style={{ height: '40px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    disabled={bulkDownloading}
                  >
                    <Download className="h-4 w-4" />
                    הורדה
                  </Button>
                  <Button
                    onClick={() => setSelectedDocuments(new Set())}
                    variant="ghost"
                    style={{ height: '40px', fontSize: '16px' }}
                    disabled={bulkDownloading}
                  >
                    ביטול בחירה
                  </Button>
                </div>
              </div>
            )}
          
            {documents.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p style={{ fontSize: '18px', color: '#708993' }}>לא נמצאו מסמכים</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {monthGroups.map((group, groupIndex) => (
                  <div
                    key={group.key}
                    style={{
                      backgroundColor: "#FFFFFF",
                     
                    }}
                  >
                    <div style={{ padding: "18px 20px 10px 20px" }}>
                      <h4 className="text-right text-base font-semibold" style={{ color: "#19183B", margin: 0 }}>
                        {group.label}
                      </h4>
                    </div>

                    <div>
                      <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", fontSize: tableFontSize, tableLayout: "fixed" }}>
                        <colgroup>
                          {/* checkbox */}
                          <col style={{ width: "36px" }} />
                          {/* status */}
                          <col style={{ width: "clamp(60px, 8vw, 44px)" }} />
                          {/* number */}
                          <col style={{ width: "clamp(55px, 7vw, 55px)" }} />
                          {/* date */}
                          <col style={{ width: "clamp(90px, 10vw, 80px)" }} />
                          {/* doc type (narrower) */}
                          <col style={{ width: "clamp(150px, 9vw, 120px)" }} />
                          {/* customer (narrower) */}
                          <col style={{ width: "clamp(190px, 40vw, 60px)" }} />
                          {/* description (wider) */}
                          <col style={{ width: "clamp(211px, 50vw, 210px)" }} />
                          {/* amount */}
                          <col style={{ width: "clamp(50px, 10vw, 140px)" }} />
                          {/* actions */}
                          <col style={{ width: "260px" }} />
                        </colgroup>

                        <tbody>
                          {group.docs.map((doc, index) => (
                            <tr
                              className="docs-row-fixed"
                              key={doc.id}
                              style={{
                                backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#EDF1F5',
                                borderBottom: '1px solid #EDF1F5',
                                position: 'relative',
                              }}
                              onMouseEnter={() => setHoveredRowId(doc.id)}
                              onMouseLeave={() => setHoveredRowId(null)}
                            >
                      {/* Checkbox */}
                      <td style={{ padding: '5px 3px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedDocuments.has(doc.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const newSelected = new Set(selectedDocuments);
                            if (e.target.checked) {
                              newSelected.add(doc.id);
                            } else {
                              newSelected.delete(doc.id);
                            }
                            setSelectedDocuments(newSelected);
                          }}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </td>
                      
                      {/* סטטוס */}
                      <td style={{ padding: '5px 3px', textAlign: 'right' }}>
                        {(() => {
                          const uiStatus = getRowStatusRaw(doc);
                          const docType = String(doc?.document_type || "").toLowerCase();
                          const docStatus = String(doc?.document_status || "").toLowerCase();
                          const badge = getStatusBadgeForDoc(docType, uiStatus);
                          if (ACCOUNTING_DOC_TYPES.has(docType) && (docStatus === "cancelled" || docStatus === "canceled" || docStatus === "void")) {
                            if (!statusLogOnceRef.current.has(doc.id)) {
                              statusLogOnceRef.current.add(doc.id);
                            }
                          }
                          return (
                            <span
                              className="ui-badge"
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                fontWeight: 400,
                                ...badge.style,
                              }}
                              title="חיווי UI בלבד"
                            >
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* מספר */}
                      <td style={{ padding: '5px 3px', textAlign: 'right', fontSize: tableFontSize, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const config = DOCUMENT_CONFIGS_BY_DB.get(doc.document_type);
                            if (config) {
                              const basePath = config.category === "business" ? "/business/documents" : "/dashboard/documents";
                              agentLogNav({
                                location: "DocumentsListClient.tsx:numberClick",
                                message: "Navigate to summary from number click",
                                data: { documentId: doc.id, documentType: doc.document_type, category: config.category, basePath, routeSegment: config.routeSegment },
                                timestamp: Date.now(),
                                hypothesisId: "H_NAV_BASEPATH",
                              });
                              router.push(`${basePath}/${config.routeSegment}/${doc.id}/summary`);
                              return;
                            }
                            router.push(`/dashboard/documents/${doc.id}`);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "#1A8299",
                            fontWeight: 400,
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                          }}
                          title="לעמוד המסמך"
                        >
                          {doc.document_number || "—"}
                        </button>
                      </td>
                      
                      {/* תאריך */}
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap' }}>
                        {formatDate(doc.document_date)}
                      </td>
                      
                      {/* סוג המסמך */}
                      <td style={{ padding: '5px 3px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span title={getDocumentTypeLabel(doc.document_type)}>{getDocumentTypeLabel(doc.document_type)}</span>
                      </td>
                      
                      {/* שם הלקוח */}
                      <td style={{ padding: '5px 3px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.customer_id ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/customers/${doc.customer_id}`);
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              cursor: "pointer",
                              color: "#1A8299",
                              textDecoration: "underline",
                              textUnderlineOffset: "3px",
                            }}
                            title="לעמוד הלקוח"
                          >
                            <span title={doc.customer_name || ""}>{truncateCustomerName(doc.customer_name)}</span>
                          </button>
                        ) : (
                          <span title={doc.customer_name || ""}>{truncateCustomerName(doc.customer_name)}</span>
                        )}
                      </td>
                      
                      {/* תיאור */}
                      <td style={{ padding: '5px 3px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span title={doc.document_description || ""}>{truncateDescription(doc.document_description)}</span>
                      </td>
                      
                      {/* סכום */}
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap' }}>
                        {formatAmount(doc.total_amount, doc.currency)}
                      </td>
                      
                      {/* פעולות - Row Actions */}
                      <td
                        className="docs-actions-cell"
                        style={{ padding: '6px', textAlign: 'right', position: 'relative', width: '260px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="docs-actions-shift docs-actions-icons flex items-center justify-end gap-2"
                          style={{
                            marginBottom: 3,
                            opacity: hoveredRowId === doc.id ? 1 : 0,
                            pointerEvents: hoveredRowId === doc.id ? "auto" : "none",
                          }}
                        >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="צפייה"
                              onClick={() => {
                                router.push(`/dashboard/documents/${doc.id}`);
                              }}
                            >
                              <Eye className="h-5 w-5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="הורדה"
                              onClick={async () => {
                                try {
                                  await downloadDocumentPdf(doc.id, `document-${doc.document_number || doc.id}.pdf`);
                                } catch (e: any) {
                                  alert(e?.message || "שגיאה בהורדת המסמך");
                                }
                              }}
                            >
                              <Download className="h-5 w-5" />
                            </Button>
                            <ChainNewDocumentDialog
                              onSelect={(kind) => chainToNewDocument(kind, doc)}
                              sourceDocumentType={doc.document_type}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="שרשור מסמך חדש"
                              >
                                <GitBranchPlus className="h-5 w-5" />
                              </Button>
                            </ChainNewDocumentDialog>
                            {shouldShowCancelFlowButton(doc) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="ביטול מסמך"
                                onClick={() => {
                                  setCancelConfirmSource(doc);
                                }}
                              >
                                <X className="h-5 w-5" />
                              </Button>
                            )}
                            {shouldShowCloseButton(doc.document_type) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="סגירת מסמך"
                                onClick={() => handleCloseDocument(doc.id)}
                              >
                                <XCircle className="h-5 w-5" />
                              </Button>
                            )}
                        </div>
                      </td>
                          </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
              <Button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                variant="secondary"
                style={{ height: '40px', fontSize: '16px' }}
              >
                הקודם
              </Button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: '18px', color: '#19183B' }}>
                עמוד {page} מתוך {totalPages}
              </span>
              <Button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                variant="secondary"
                style={{ height: '40px', fontSize: '16px' }}
              >
                הבא
              </Button>
            </div>
          )}
        </FormSection>
      </div>


      {closeConfirmDocumentId && (
        <div
          className="receipt-confirmation-overlay fixed inset-0 flex items-center justify-center"
          onClick={() => {
            if (!closeConfirmLoading) setCloseConfirmDocumentId(null);
          }}
          role="presentation"
          dir="rtl"
        >
          <div
            className="receipt-confirmation-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-document-title"
            aria-describedby="close-document-description"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="receipt-confirmation-content">
              <div className="receipt-confirmation-body">
                <h2 id="close-document-title" className="receipt-confirmation-title">
                  סגירת מסמך
                </h2>
                <p
                  id="close-document-description"
                  className="receipt-confirmation-warning-text"
                  style={{ textAlign: "center" }}
                >
                  האם אתה בטוח שברצונך לסגור מסמך זה?
                </p>
              </div>
              <div className="receipt-confirmation-footer">
                <Button
                  type="button"
                  variant="primary"
                  onClick={confirmCloseDocument}
                  disabled={closeConfirmLoading}
                  loading={closeConfirmLoading}
                  className="w-full max-w-[300px]"
                >
                  סגור מסמך
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmSource && (
        <div
          className="receipt-confirmation-overlay fixed inset-0 flex items-center justify-center"
          onClick={() => setCancelConfirmSource(null)}
          role="presentation"
          dir="rtl"
        >
          <div
            className="receipt-confirmation-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-document-title"
            aria-describedby="cancel-document-description"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="receipt-confirmation-close"
              aria-label="סגירה"
              onClick={() => setCancelConfirmSource(null)}
            >
              <X className="h-5 w-5 text-modal-fg" />
            </button>
            <div className="receipt-confirmation-content">
              <div className="receipt-confirmation-body">
                {(() => {
                  const content = getCancellationIntroContent(cancelConfirmSource);
                  return (
                    <>
                      <h2 id="cancel-document-title" className="receipt-confirmation-title">
                        {content.title}
                      </h2>
                      <p
                        id="cancel-document-description"
                        className="receipt-confirmation-warning-text"
                        style={{ textAlign: "center" }}
                      >
                        {content.description}
                      </p>
                      {content.items.length > 0 && (
                        <ul className="mt-4 text-right text-[16px] text-modal-fg space-y-2">
                          {content.items.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      )}
                      {content.note && (
                        <div className="mt-4 text-sm text-muted-fg">{content.note}</div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="receipt-confirmation-footer">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const source = cancelConfirmSource;
                    setCancelConfirmSource(null);
                    startCancellationFlow(source);
                  }}
                  className="w-full max-w-[300px]"
                >
                  {getCancellationIntroContent(cancelConfirmSource).actionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
