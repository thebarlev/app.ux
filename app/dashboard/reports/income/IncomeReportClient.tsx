"use client";

import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { DateInput } from "@/components/ui/date-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { FormActions } from "@/components/ui/form-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { selectUnderline } from "@/components/ui/field-styles";

const DOCUMENT_TYPES = [
  { value: "all", label: "כל המסמכים" },
  { value: "tax_invoice", label: "חשבונית מס" },
  { value: "receipt_invoice", label: "חשבונית מס / קבלה" },
  { value: "receipt", label: "קבלה" },
  { value: "donation_receipt", label: "קבלה על תרומה" },
  { value: "donation_cancel", label: "ביטול תרומה" },
  { value: "credit_invoice", label: "חשבונית זיכוי" },
];

const FILE_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "hashavshevet", label: "שבשבת" },
  { value: "priority", label: "פריוריטי" },
  { value: "sap", label: "SAP" },
];

export default function IncomeReportClient() {
  const router = useRouter();
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  type DateFilter =
    | { kind: "none"; label: string }
    | { kind: "preset"; preset: "last7" | "last30" | "last12mo"; dateFrom: string; dateTo: string; label: string }
    | { kind: "calendarYear"; year: number; dateFrom: string; dateTo: string; label: string }
    | { kind: "custom"; dateFrom: string; dateTo: string; label: string };
  const [dateFilter, setDateFilter] = useState<DateFilter>({ kind: "none", label: "טווח תאריכים" });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [dataScope, setDataScope] = useState<"10000" | "500000">("10000");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const documentTypeOptions = useMemo(() => DOCUMENT_TYPES.map((t) => t.value), []);
  const documentTypeLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of DOCUMENT_TYPES) map.set(t.value, t.label);
    return map;
  }, []);
  const isAllDocTypesSelected = useMemo(() => {
    if (selectedDocTypes.size === 0) return false;
    return documentTypeOptions.every((t) => selectedDocTypes.has(t));
  }, [documentTypeOptions, selectedDocTypes]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (dateFilter.kind !== "none") return;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const dateFrom = formatIsoDate(from);
    const dateTo = formatIsoDate(now);
    setCustomFrom(dateFrom);
    setCustomTo(dateTo);
    applyDateFilter({
      kind: "custom",
      dateFrom,
      dateTo,
      label: formatRangeDmy(dateFrom, dateTo),
    });
  }, [dateFilter.kind]);

  const handleAddEmail = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && emailInput.trim()) {
      e.preventDefault();
      const email = emailInput.trim();
      // Simple email validation
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emails.length < 5) {
        setEmails([...emails, email]);
        setEmailInput("");
      }
    }
  };

  function formatIsoDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDmyFromIso(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
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

  function closeDatePickerUi() {
    setDateSheetOpen(false);
  }

  function applyDateFilter(next: DateFilter) {
    setDateFilter(next);
    closeDatePickerUi();
  }

  function clearDateFilter() {
    setDateFilter({ kind: "none", label: "טווח תאריכים" });
    setCustomFrom("");
    setCustomTo("");
    setDateRangeError(null);
    closeDatePickerUi();
  }

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const dateFrom = "dateFrom" in dateFilter ? (dateFilter as any).dateFrom : null;
    const dateTo = "dateTo" in dateFilter ? (dateFilter as any).dateTo : null;

    if (!dateFrom || !dateTo) {
      setMessage({ type: "error", text: "נא למלא את שדות התאריך" });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      // Import the action dynamically
      const { generateIncomeReportAction } = await import("../actions");
      
      const result = await generateIncomeReportAction({
        startDate: dateFrom,
        endDate: dateTo,
        documentTypes:
          selectedDocTypes.size === 0 || isAllDocTypesSelected ? [] : Array.from(selectedDocTypes),
        customerName: customerSearch || undefined,
        fileFormat,
        scope: dataScope,
        emails: emails.length > 0 ? emails : undefined,
      });

      if (result.ok) {
        const monthText = result.totalMonths === 1 ? "חודש אחד" : `${result.totalMonths} חודשים`;
        const documentCount =
          typeof result.documentCount === "number"
            ? result.documentCount
            : result.reports.reduce((sum: number, r: any) => sum + r.documentCount, 0);
        setMessage({
          type: "success",
          text: `הדוח הופק בהצלחה! עסק: ${result.companyName}, תקופה: ${monthText}, סה"כ מסמכים: ${documentCount}. ההורדה תתחיל בקרוב...`
        });

        if (result.download?.base64 && result.download?.filename) {
          const binary = atob(result.download.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/zip" });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = result.download.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } else {
          console.log("Generated reports:", result.reports);
        }
      } else {
        setMessage({ type: "error", text: `שגיאה בהפקת הדוח: ${result.error}` });
      }
    } catch (error: any) {
      console.error("Report generation error:", error);
      setMessage({ type: "error", text: `שגיאה: ${error.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = "dateFrom" in dateFilter && "dateTo" in dateFilter;
  const dateTriggerLabel = dateFilter.label;

  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10">
        {/* Page Header */}
        <div className="mb-[50px]">
          <Link
            href="/dashboard/reports"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
              color: "#19183B",
              textDecoration: "none",
              fontSize: "18px",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={18} />
            חזרה לדוחות
          </Link>
          <h1 className="text-right mb-4">
            דוח הכנסות להנהלת חשבונות
          </h1>
        </div>

        {/* Message */}
        {message && (
          <Card className={`mb-[50px] ${
            message.type === "success" 
              ? "border-success bg-success/10" 
              : "border-danger bg-danger/10"
          }`}>
            <CardContent className="p-4">
              <div className={`font-semibold text-right ${
                message.type === "success" ? "text-success" : "text-danger"
              }`}>
                {message.text}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="ui-section-gap">
          {/* Document Type & Period */}
          <FormSection title="פרטי הדוח">
            <div className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
              <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <div className="min-w-0">
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
                              ? documentTypeLabelByValue.get(Array.from(selectedDocTypes)[0]) || Array.from(selectedDocTypes)[0]
                              : `${selectedDocTypes.size} סוגי מסמכים`}
                          </span>
                          <span>▾</span>
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="ui-dd-content min-w-[260px]" style={{ direction: "rtl" }}>
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

                        {DOCUMENT_TYPES.map((type) => (
                          <DropdownMenuCheckboxItem
                            key={type.value}
                            className="ui-dd-check"
                            checked={selectedDocTypes.has(type.value) || isAllDocTypesSelected}
                            onSelect={(e) => {
                              e.preventDefault();
                              setSelectedDocTypes((prev) => {
                                const next = new Set(prev);
                                if (next.has(type.value)) next.delete(type.value);
                                else next.add(type.value);
                                return next;
                              });
                            }}
                          >
                            <span className="ui-dd-check-label">{type.label}</span>
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FieldWrapper>
                </div>

                <div className="min-w-0">
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
                              setCustomFrom(r.dateFrom);
                              setCustomTo(r.dateTo);
                              setDateRangeError(null);
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
                              setCustomFrom(r.dateFrom);
                              setCustomTo(r.dateTo);
                              setDateRangeError(null);
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
                              setCustomFrom(r.dateFrom);
                              setCustomTo(r.dateTo);
                              setDateRangeError(null);
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
                              setCustomFrom(dateFrom);
                              setCustomTo(dateTo);
                              setDateRangeError(null);
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
                              setCustomFrom(dateFrom);
                              setCustomTo(dateTo);
                              setDateRangeError(null);
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
                                    setDateRangeError(null);
                                    if (customTo && newFromIso && customTo < newFromIso) {
                                      setCustomTo("");
                                      setDateRangeError(null);
                                      return;
                                    }
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
                                        label: formatRangeDmy(newFromIso, customTo),
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
                                    setDateRangeError(null);
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
                                        label: formatRangeDmy(customFrom, newToIso),
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
            </div>
          </FormSection>

          {/* Customer Search */}
          <FormSection title="סינון לפי לקוח">
            <div className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
              <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FloatingInput
                  label="דוח לפי לקוח"
                  id="customerSearch"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  helperText="אם השדה ריק, הדוח יופק עבור כל הלקוחות"
                  containerClassName="w-full min-w-0"
                />
              </div>
            </div>
          </FormSection>

          {/* File Format & Data Scope */}
          <FormSection title="הגדרות קובץ">
            <div className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
              <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <div className="w-full min-w-0">
                  <label htmlFor="fileFormat" className="block text-right text-[12px] text-fg mb-0 leading-none">
                    סוג קובץ
                  </label>
                  <Select value={fileFormat} onValueChange={setFileFormat}>
                    <SelectTrigger id="fileFormat" variant="underline" className="text-fg border-border focus:border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILE_FORMATS.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <FieldWrapper
                  label="היקף נתונים"
                  id="dataScope"
                  className="ui-field-block w-full min-w-0"
                  labelClassName="ui-select-label"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '12px', borderRadius: '8px', backgroundColor: dataScope === "10000" ? '#EDF1F5' : 'transparent', transition: 'background 0.2s' }}>
                      <input
                        type="radio"
                        name="dataScope"
                        value="10000"
                        checked={dataScope === "10000"}
                        onChange={(e) => setDataScope(e.target.value as "10000")}
                        style={{ marginLeft: '8px' }}
                      />
                      <div style={{ fontSize: '18px', color: '#19183B', fontWeight: 500 }}>
                        הקובץ מכיל עד 10,000 מסמכים
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '12px', borderRadius: '8px', backgroundColor: dataScope === "500000" ? '#EDF1F5' : 'transparent', transition: 'background 0.2s' }}>
                      <input
                        type="radio"
                        name="dataScope"
                        value="500000"
                        checked={dataScope === "500000"}
                        onChange={(e) => setDataScope(e.target.value as "500000")}
                        style={{ marginLeft: '8px' }}
                      />
                      <div style={{ fontSize: '18px', color: '#19183B', fontWeight: 500 }}>
                        הקובץ מכיל עד 500,000 מסמכים
                      </div>
                    </label>
                  </div>

                  {/* Info Message */}
                  {fileFormat === "pdf" && (
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#5389BB', borderRadius: '8px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                      <AlertCircle className="h-4 w-4" style={{ color: '#FFFFFF', marginTop: '2px', flexShrink: 0 }} />
                      <p style={{ fontSize: '14px', color: '#FFFFFF' }}>
                        בהפקת דוח PDF שעולה מעל 300 מסמכים, יופק רק עמוד סיכום ללא פירוט המסמכים
                      </p>
                    </div>
                  )}
                </FieldWrapper>
              </div>
            </div>
          </FormSection>

          {/* Email Tags */}
          <FormSection title="שליחת דוח במייל">
            <div className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
              <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <div className="w-full min-w-0">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Email Tags */}
                    {emails.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {emails.map((email, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              backgroundColor: '#EDF1F5',
                              color: '#19183B',
                              padding: '6px 12px',
                              borderRadius: '20px',
                              fontSize: '16px',
                            }}
                          >
                            <span>{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(index)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#19183B',
                              }}
                              aria-label="הסר מייל"
                            >
                              <span style={{ fontSize: '18px', lineHeight: 1 }}>×</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <FloatingInput
                      label="כתובת מייל לשליחת הדוח"
                      id="emailInput"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={handleAddEmail}
                      disabled={emails.length >= 5}
                      dir="ltr"
                      className="text-left"
                      helperText="ניתן להזין עד 5 כתובות מייל. הדוח יישלח גם למייל וגם יורד אוטומטית למחשב שלך"
                      containerClassName="w-full min-w-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </FormSection>

          {/* Action Buttons */}
          <div className="mt-10">
            <FormActions
              primaryLabel={isSubmitting ? "מפיק דוח..." : "הפקת הדוח"}
              secondaryLabel="ביטול"
              onSecondaryClick={() => router.push("/dashboard/reports")}
              primaryLoading={isSubmitting}
              primaryDisabled={!isFormValid || isSubmitting}
              secondaryDisabled={isSubmitting}
              primaryType="submit"
            />
          </div>
        </form>

        {/* Mobile Date Sheet */}
        <Sheet open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
          <SheetContent side="bottom" dir="rtl" className="h-[80vh] rounded-t-xl bg-card text-card-fg text-right">
            <SheetHeader>
              <SheetTitle className="ui-sheet-title">טווח תאריכים</SheetTitle>
            </SheetHeader>

            <div className="ui-sheet-body">
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const r = presetToRange("last7");
                    setCustomFrom(r.dateFrom);
                    setCustomTo(r.dateTo);
                    setDateRangeError(null);
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
                    setCustomFrom(r.dateFrom);
                    setCustomTo(r.dateTo);
                    setDateRangeError(null);
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
                    setCustomFrom(r.dateFrom);
                    setCustomTo(r.dateTo);
                    setDateRangeError(null);
                    applyDateFilter({ kind: "preset", preset: "last12mo", ...r, label: "12 חודשים אחרונים" });
                  }}
                  className="h-[50px] text-[18px] justify-end"
                >
                  12 חודשים אחרונים
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const now = new Date();
                    const y = now.getFullYear();
                    const dateFrom = `${y}-01-01`;
                    const dateTo = `${y}-12-31`;
                    setCustomFrom(dateFrom);
                    setCustomTo(dateTo);
                    setDateRangeError(null);
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
                    setCustomFrom(dateFrom);
                    setCustomTo(dateTo);
                    setDateRangeError(null);
                    applyDateFilter({ kind: "calendarYear", year: y, dateFrom, dateTo, label: `שנה קודמת (${y})` });
                  }}
                  className="h-[50px] text-[18px] justify-end"
                >
                  שנה קודמת
                </Button>
              </div>

              <div className="mt-6 grid w-full grid-cols-2 gap-2">
                <DateInput
                  className="h-[50px] !text-[18px]"
                  value={customFrom}
                  onChange={(newFromIso) => {
                    setCustomFrom(newFromIso);
                    setDateRangeError(null);
                    if (customTo && newFromIso && customTo < newFromIso) {
                      setCustomTo("");
                      setDateRangeError(null);
                      return;
                    }
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
                        label: formatRangeDmy(newFromIso, customTo),
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
                    setDateRangeError(null);
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
                        label: formatRangeDmy(customFrom, newToIso),
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

              {dateRangeError && (
                <div className="mt-2 text-right" style={{ color: "#B91C1C", fontSize: "14px" }}>
                  {dateRangeError}
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="secondary"
                  onClick={() => clearDateFilter()}
                  className="h-[50px] text-[18px] justify-end w-full"
                >
                  איפוס
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </main>
  );
}
