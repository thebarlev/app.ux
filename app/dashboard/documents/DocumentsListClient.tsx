"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { Card, CardContent } from "@/components/ui/card";
import { getAllDocumentsListAction, type DocumentsListFilters, type DocumentsListResult } from "./actions";
import { getReceiptPreviewUrlAction } from "./receipt/actions";
import { Eye, Copy, Download, X } from "lucide-react";
import DocumentsQuickViewDrawer, { type DocumentsQuickViewDocumentSnapshot } from "@/components/documents/DocumentsQuickViewDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { selectUnderline } from "@/components/ui/field-styles";
import { cn } from "@/lib/utils";

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
  return `${amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr === "ILS" ? "₪" : curr}`;
}

function getDocumentTypeLabel(type: string): string {
  switch (type) {
    case "receipt":
      return "קבלה";
    case "invoice":
      return "חשבונית";
    case "quote":
      return "הצעת מחיר";
    case "delivery_note":
      return "תעודת משלוח";
    default:
      return type;
  }
}

function normalizeStatus(raw: string | null | undefined): "open" | "pending" | "closed" | "canceled" | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();

  // New set (as specified)
  if (s === "open" || s === "pending" || s === "closed" || s === "canceled") return s;

  // Existing set (map to closest meaning)
  if (s === "draft") return "open";
  if (s === "final") return "closed";
  if (s === "void" || s === "cancelled") return "canceled";

  return null;
}

function getStatusBadge(statusRaw: string): { label: string; style: CSSProperties } {
  const status = normalizeStatus(statusRaw);
  if (!status) {
    return {
      label: "לא ידוע",
      style: {
        backgroundColor: "#F1F5F9",
        color: "#475569",
      },
    };
  }

  switch (status) {
    case "closed":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } };
    case "pending":
      return { label: "ממתין", style: { backgroundColor: "#FFF6E5", color: "#B45309" } };
    case "canceled":
      return { label: "מבוטל", style: { backgroundColor: "#FDE8E8", color: "#B91C1C" } };
    case "open":
      return { label: "פתוח", style: { backgroundColor: "#E8F2FF", color: "#1D4ED8" } };
  }
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

export default function DocumentsListClient({ initialData, initialFilters }: Props) {
  const router = useRouter();

  // Dev-only: allow QA to test multi-select UI even when the dataset currently contains only receipts.
  const SHOW_ALL_DOC_TYPES_FOR_TEST = process.env.NODE_ENV !== "production";
  const ALL_DOC_TYPES_FOR_TEST = ["receipt", "invoice", "quote", "delivery_note"] as const;

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

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocSnapshot, setSelectedDocSnapshot] = useState<DocumentsQuickViewDocumentSnapshot | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

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

  const effectiveData = dateFilter.kind === "none" ? initialData.data! : clientData || initialData.data!;
  const { documents, totalCount, page, pageSize } = effectiveData;
  const totalPages = Math.ceil(totalCount / pageSize);
  const tableFontSize = "clamp(14px, 1.1vw, 18px)";
  const tableHeaderColor = "#1D868F";
  const tableHeaderBorder = "1px solid #EDF1F5";

  const documentTypeOptions = useMemo(() => {
    // Current system: only receipts exist. Show only the types that exist in data,
    // but always include receipts so the option remains available even when list is empty.
    const set = new Set<string>(["receipt"]);
    for (const d of documents) {
      if (d?.document_type) set.add(d.document_type);
    }
    if (SHOW_ALL_DOC_TYPES_FOR_TEST) {
      for (const t of ALL_DOC_TYPES_FOR_TEST) set.add(t);
    }
    // Keep selected options visible even if current list is filtered and doesn't include them.
    for (const t of selectedDocTypes) set.add(t);
    return Array.from(set);
  }, [documents, selectedDocTypes, SHOW_ALL_DOC_TYPES_FOR_TEST]);

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
      setDocumentType("all");
    } else {
      setDocumentType(Array.from(selectedDocTypes).join(","));
    }
  }, [isAllDocTypesSelected, selectedDocTypes]);


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
        page: opts.nextPage,
        pageSize,
        dateFrom: opts.nextDateFrom || undefined,
        dateTo: opts.nextDateTo || undefined,
      });

      if (!res.ok || !res.data) {
        setClientError(res.message || "שגיאה בטעינת מסמכים");
        return;
      }

      setClientData(res.data);
    } finally {
      setClientLoading(false);
    }
  }

  async function downloadDocumentPdf(documentId: string, fileName: string) {
    const pdfUrl = `/api/documents/${documentId}/pdf`;
    const response = await fetch(pdfUrl);

    if (!response.ok) {
      throw new Error("שגיאה בהורדת המסמך");
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

    router.push(`/dashboard/documents?${params.toString()}`);
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
    router.push("/dashboard/documents");
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

    router.push(`/dashboard/documents?${params.toString()}`);
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
      className="ui-container pt-6 sm:pt-10 max-w-full sm:max-w-[1200px] px-0 sm:px-[2px]"
      style={{ minHeight: "100vh" }}
    >
      {/* Page Header */}
      <div className="mb-8 sm:mb-[20px]">
        <h1 className="text-right mb-2 sm:mb-4">מסמכים</h1>
        <p className="text-right">{totalCount} מסמכים סה״כ</p>
      </div>

      {/* Search Section */}
      <FormSection title="חיפוש וסינון">
        <div
          ref={searchFiltersCardRef}
          className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 [&_input#search:focus]:bg-[var(--input)]"
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
                className="w-full min-w-0"
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
                className="w-full min-w-0"
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
          <div style={{ overflowX: "auto" }}>
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
                <col style={{ width: "clamp(66px, 8vw, 70px)" }} />
                {/* number */}
                <col style={{ width: "clamp(50px, 7vw, 66px)" }} />
                {/* date */}
                <col style={{ width: "clamp(100px, 10vw, 110px)" }} />
                {/* doc type (narrower) */}
                <col style={{ width: "clamp(100px, 9vw, 90px)" }} />
                {/* customer (narrower) */}
                <col style={{ width: "clamp(140px, 16vw, 160px)" }} />
                {/* description (wider) */}
                <col style={{ width: "clamp(120px, 30vw, 110px)" }} />
                {/* amount */}
                <col style={{ width: "clamp(110px, 10vw, 140px)" }} />
                {/* actions */}
                <col style={{ width: "120px" }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: "#FFFFFF", borderBottom: tableHeaderBorder }}>
                  {/* empty placeholder for checkbox column (no select-all checkbox) */}
                  <th style={{ padding: "10px 6px", textAlign: "center", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }} />
                  <th style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סטטוס</th>
                  <th style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>מספר</th>
                  <th style={{ padding: "10px 8px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תאריך</th>
                  <th style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סוג המסמך</th>
                  <th style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>שם הלקוח</th>
                  <th style={{ padding: "10px 6px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>תיאור</th>
                  <th style={{ padding: "10px 8px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>סכום</th>
                  <th style={{ padding: "12px", textAlign: "right", fontSize: tableFontSize, fontWeight: 500, color: tableHeaderColor }}>פעולות</th>
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

                    <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", fontSize: tableFontSize, tableLayout: "fixed" }}>
                      <colgroup>
                        {/* checkbox */}
                        <col style={{ width: "36px" }} />
                        {/* status */}
                        <col style={{ width: "clamp(66px, 8vw, 70px)" }} />
                        {/* number */}
                        <col style={{ width: "clamp(50px, 7vw, 66px)" }} />
                        {/* date */}
                        <col style={{ width: "clamp(100px, 10vw, 110px)" }} />
                        {/* doc type (narrower) */}
                        <col style={{ width: "clamp(100px, 9vw, 90px)" }} />
                        {/* customer (narrower) */}
                        <col style={{ width: "clamp(140px, 16vw, 160px)" }} />
                        {/* description (wider) */}
                        <col style={{ width: "clamp(120px, 30vw, 110px)" }} />
                        {/* amount */}
                        <col style={{ width: "clamp(110px, 10vw, 140px)" }} />
                        {/* actions */}
                        <col style={{ width: "120px" }} />
                      </colgroup>

                      <tbody>
                        {group.docs.map((doc, index) => (
                          <tr
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
                      <td style={{ padding: '10px 6px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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
                      <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                        {(() => {
                          const badge = getStatusBadge(doc.document_status);
                          return (
                            <span
                              className="ui-badge"
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "14px",
                                fontWeight: 400,
                                ...badge.style,
                              }}
                            >
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* מספר */}
                      <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: tableFontSize, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (doc.document_type === "receipt") {
                              router.push(`/dashboard/documents/receipt/${doc.id}/summary`);
                              return;
                            }
                            setSelectedDocumentId(doc.id);
                            setSelectedDocSnapshot(doc);
                            setIsQuickViewOpen(true);
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
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap' }}>
                        {formatDate(doc.document_date)}
                      </td>
                      
                      {/* סוג המסמך */}
                      <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span title={getDocumentTypeLabel(doc.document_type)}>{getDocumentTypeLabel(doc.document_type)}</span>
                      </td>
                      
                      {/* שם הלקוח */}
                      <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                            {doc.customer_name || "—"}
                          </button>
                        ) : (
                          doc.customer_name || "—"
                        )}
                      </td>
                      
                      {/* תיאור */}
                      <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span title={doc.document_description || ""}>{truncateDescription(doc.document_description)}</span>
                      </td>
                      
                      {/* סכום */}
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: tableFontSize, color: '#19183B', whiteSpace: 'nowrap' }}>
                        {formatAmount(doc.total_amount, doc.currency)}
                      </td>
                      
                      {/* פעולות - Row Actions */}
                      <td
                        style={{ padding: '12px', textAlign: 'right', position: 'relative', width: '120px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            opacity: hoveredRowId === doc.id ? 1 : 0,
                            pointerEvents: hoveredRowId === doc.id ? 'auto' : 'none',
                            transition: 'opacity 120ms ease-in-out',
                          }}
                        >
                            {/* צפייה */}
                            <button
                              onClick={async () => {
                                setSelectedDocumentId(doc.id);
                                setSelectedDocSnapshot(doc);
                                setIsQuickViewOpen(true);
                              }}
                              className="text-[#1A8299] [&>svg]:text-current hover:[&>svg]:text-[#F39600]"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="צפייה"
                            >
                              <Eye className="h-5 w-5 text-current" />
                            </button>
                            
                            {/* שכפול */}
                            <button
                              onClick={() => {
                                // TODO: Implement duplication logic
                                alert("שכפול מסמך - ייושם בקרוב");
                              }}
                              className="text-[#1A8299] [&>svg]:text-current hover:[&>svg]:text-[#F39600]"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="שכפול"
                            >
                              <Copy className="h-5 w-5 text-current" />
                            </button>
                            
                            {/* הורדה */}
                            <button
                              onClick={async () => {
                                try {
                                  await downloadDocumentPdf(doc.id, `document-${doc.document_number || doc.id}.pdf`);
                                } catch (error: any) {
                                  alert(error.message || "שגיאה בהורדת המסמך");
                                }
                              }}
                              className="text-[#1A8299] [&>svg]:text-current hover:[&>svg]:text-[#F39600]"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="הורדה"
                            >
                              <Download className="h-5 w-5 text-current" />
                            </button>
                            
                            {/* ביטול מסמך */}
                            <button
                              onClick={() => {
                                // TODO: Implement cancellation logic
                                alert("ביטול מסמך - ייושם בקרוב");
                              }}
                              className="text-[#9B0003] [&>svg]:text-current hover:[&>svg]:text-[#F39600]"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="ביטול מסמך"
                            >
                              <X className="h-5 w-5 text-current" />
                            </button>
                        </div>
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

      <DocumentsQuickViewDrawer
        open={isQuickViewOpen}
        onClose={() => setIsQuickViewOpen(false)}
        documentId={selectedDocumentId}
        initialDoc={selectedDocSnapshot}
        onDownload={selectedDocumentId ? async () => {
          try {
            await downloadDocumentPdf(selectedDocumentId, `document-${selectedDocSnapshot?.document_number || selectedDocumentId}.pdf`);
          } catch (e: any) {
            alert(e?.message || "שגיאה בהורדת המסמך");
          }
        } : undefined}
        onOpenSummary={
          selectedDocSnapshot?.document_type === "receipt" && selectedDocumentId
            ? async () => {
                setIsQuickViewOpen(false);
                router.push(`/dashboard/documents/receipt/${selectedDocumentId}/summary`);
              }
            : undefined
        }
        onViewDocument={
          selectedDocSnapshot?.document_type === "receipt" && selectedDocumentId
            ? async () => {
                const result = await getReceiptPreviewUrlAction(selectedDocumentId);
                if (result.ok && result.url) {
                  window.open(result.url, "_blank");
                } else {
                  alert(result.message || "שגיאה בפתיחת תצוגה מקדימה");
                }
              }
            : undefined
        }
      />
    </div>
  );
}
