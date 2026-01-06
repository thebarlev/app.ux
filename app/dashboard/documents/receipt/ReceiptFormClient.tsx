"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { InitialReceiptCreateData } from "./actions";
import type { PaymentRow, ReceiptDraftPayload } from "@/lib/types/receipt";
import { issueReceiptAction, saveReceiptDraftAction, updateReceiptDraftAction } from "./actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import PaymentDetailsSection from "./PaymentDetailsSection";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { FormActions } from "@/components/ui/form-actions";
import { cn } from "@/lib/utils";
import { FileText, Save, CheckCircle, Settings as SettingsIcon, Trash2, Plus, CheckCircle2 } from "lucide-react";

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
] as const;

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currency}`;
}

export default function ReceiptFormClient({ 
  initial,
  footerText,
  editData,
  draftId,
}: { 
  initial: InitialReceiptCreateData;
  footerText?: string;
  editData?: {
    id: string;
    customerName: string;
    documentDate: string;
    total: number;
    currency: string;
    notes: string;
  } | null;
  draftId?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);
  
  // Date locking: minimum allowed date based on last issued receipt
  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "₪");

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<{ [key: number]: { method?: string; amount?: string } }>({});

  const [notes, setNotes] = useState("");

  // Refs for focus management
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "", date: todayYmd(), amount: 0, currency },
  ]);

  const [busy, setBusy] = useState<null | "draft" | "issue">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{
    receiptId: string;
    documentNumber: string;
    companyName: string;
    payload: ReceiptDraftPayload;
  } | null>(null);

  // Check if sequence is locked, and show modal if not
  useEffect(() => {
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      // First time creating receipt, need to set starting number
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  // Load edit data if editing a draft
  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      // Note: We don't have payment rows in the draft data structure yet
      // You may need to extend getDraftReceiptForEditAction to include them
    }
  }, [editData]);

  // Preview number comes from server (NOT allocated yet)
  const previewNumber = initial.ok ? initial.previewNumber : null;

  const total = useMemo(() => {
    const sum = payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0);
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [payments, roundTotals]);

  const payload: ReceiptDraftPayload = useMemo(() => {
    return {
      documentType: "receipt",
      customerName,
      customerId,
      documentDate,
      description,
      payments,
      notes,
      currency,
      total,
      roundTotals,
      language,
    };
  }, [customerName, customerId, documentDate, description, payments, notes, currency, total, roundTotals, language]);

  if (!initial.ok) {
    return (
      <div className="p-4 border-2 border-red-200 rounded-xl bg-red-50">
        <div className="font-bold text-red-900 mb-2">שגיאה בטעינת הנתונים</div>
        <div className="text-red-700">{initial.message}</div>
      </div>
    );
  }

  // Display preview number in header
  const headerNumberText = previewNumber 
    ? `| ${previewNumber}` 
    : "| מספר יוקצה בעת הפקה";

  function addPaymentRow() {
    setPayments((prev) => [
      ...prev,
      { method: "", date: todayYmd(), amount: 0, currency },
    ]);
  }

  function updatePaymentRow(i: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Helper function to focus field with error
  function focusFieldWithError(fieldRef: React.RefObject<HTMLElement | null>) {
    if (!fieldRef?.current) return;
    
    // Scroll to field
    fieldRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    
    // Add error highlight class
    fieldRef.current.classList.add("error-field");
    
    // Remove class after animation
    setTimeout(() => {
      fieldRef.current?.classList.remove("error-field");
    }, 3000);
  }

  async function onSaveDraft() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Validation: Customer name is required
    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }
    
    // Validation: Description must be at least 5 characters
    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      focusFieldWithError(descriptionInputRef);
      return;
    }
    
    // Validation: Check payment rows
    const errors: { [key: number]: { method?: string; amount?: string } } = {};
    payments.forEach((payment, i) => {
      if (!payment.method) {
        errors[i] = { method: "יש לבחור אמצעי תשלום" };
      } else if (!payment.amount || payment.amount <= 0) {
        errors[i] = { amount: "סכום חייב להיות גדול מ-0" };
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      return;
    }
    
    setBusy("draft");
    try {
      let result;
      if (draftId && editData) {
        // Update existing draft
        result = await updateReceiptDraftAction(draftId, payload);
      } else {
        // Create new draft
        result = await saveReceiptDraftAction(payload);
      }
      
      if (!result.ok) {
        setMessage(result.message || "שגיאה בשמירת הטיוטה");
        setBusy(null);
        return;
      }
      
      // Success! Redirect to documents list
      window.location.href = "/dashboard/documents";
    } catch (error: any) {
      setMessage(error.message || "שגיאה בשמירת הטיוטה");
      setBusy(null);
    }
  }

  async function onIssue() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Validation: Customer name is required
    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }
    
    // Validation: Description must be at least 5 characters
    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      focusFieldWithError(descriptionInputRef);
      return;
    }
    
    // Validation: Check payment rows
    const errors: { [key: number]: { method?: string; amount?: string } } = {};
    payments.forEach((payment, i) => {
      const rowErrors: { method?: string; amount?: string } = {};
      if (!payment.method) {
        rowErrors.method = "יש לבחור אמצעי תשלום";
      }
      if (!payment.amount || payment.amount <= 0) {
        rowErrors.amount = "סכום חייב להיות גדול מ-0";
      }
      if (Object.keys(rowErrors).length > 0) {
        errors[i] = rowErrors;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      return;
    }
    
    // Prevent issue if sequence not locked
    if (!sequenceLocked) {
      setMessage("נדרש לבחור מספר התחלתי לפני הפקת מסמכים");
      setShowStartingNumberModal(true);
      return;
    }
    
    setBusy("issue");
    try {
      if (draftId && editData) {
        // Cannot issue from edit mode - must save first
        setMessage("יש לשמור את הטיוטה ולהפיק מהרשימה");
        setBusy(null);
        return;
      }
      
      console.log("Issuing receipt with payload:", payload);
      
      // Issue the receipt
      const result = await issueReceiptAction(payload);
      
      console.log("Issue result:", result);
      
      if (!result.ok) {
        setMessage(result.message || "שגיאה בהפקת המסמך");
        setBusy(null);
        return;
      }
      
      // Success! Show modal with options
      if (result.receiptId && result.documentNumber && result.companyName && result.payload) {
        setBusy(null);
        setSuccessModal({
          receiptId: result.receiptId,
          documentNumber: result.documentNumber,
          companyName: result.companyName,
          payload: result.payload,
        });
      }
    } catch (error: any) {
      console.error("Issue error:", error);
      setMessage(error.message || "שגיאה בהפקת המסמך");
      setBusy(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
      <div className="ui-container pt-10">
        {/* Page Header */}
        <h1 className="text-right font-semibold" style={{ fontSize: '36px', color: '#19183B' }}>
          קבלה {previewNumber || '---'}
        </h1>
        {initial.companyName && (
          <h2 className="text-right mt-2" style={{ fontSize: '24px', fontWeight: 500, color: '#19183B' }}>{initial.companyName}</h2>
        )}
        <div className="h-[50px]" />
        <div className="mb-[50px]">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '18px', 
              color: '#19183B', 
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            הגדרות
          </button>
        </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <Card className="mb-[50px]" style={{ backgroundColor: 'white' }}>
          <CardHeader>
            <CardTitle style={{ color: '#19183B', fontSize: '20px', fontWeight: 500 }}>הגדרות מסמך</CardTitle>
            <CardDescription style={{ color: '#19183B', fontSize: '18px' }}>התאם את ברירות המחדל למסמך זה</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <FieldWrapper label="שפה" className="!w-full">
                <Select value={language} onValueChange={(v) => setLanguage(v as any)} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="he">עברית</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="מטבע ברירת מחדל" className="!w-full">
                <Select value={currency} onValueChange={setCurrency} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="₪">₪</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="עיגול סכומים" className="!w-full" hint="סכומים עם עשרוני יעוגלו למספר שלם (לדוגמה: 100.50 → 101)">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#EDF1F5', height: '50px' }}>
                  <span style={{ fontSize: '18px', color: '#19183B', fontWeight: 500 }}>
                    {roundTotals ? 'פעיל' : 'כבוי'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRoundTotals(!roundTotals)}
                    style={{
                      width: '56px',
                      height: '28px',
                      borderRadius: '14px',
                      backgroundColor: roundTotals ? '#1D868F' : '#ccc',
                      border: 'none',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '12px',
                        backgroundColor: 'white',
                        position: 'absolute',
                        top: '2px',
                        right: roundTotals ? '2px' : '30px',
                        transition: 'right 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </div>
              </FieldWrapper>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Sections */}
      <form className="ui-section-gap">
        {/* Customer Details */}
        <FormSection 
          title="פרטי לקוח"
          description="בחר לקוח קיים או הזן שם חדש"
        >
          <div className="ui-form-grid">
          <FieldWrapper 
            label="שם לקוח" 
            required 
            error={customerNameError}
            id="customerName"
          >
            <div ref={customerNameRef}>
              <CustomerAutocomplete
                value={customerName}
                onChange={(value) => {
                  setCustomerName(value);
                  if (customerNameError && value.trim().length > 0) {
                    setCustomerNameError(null);
                  }
                }}
                onSelectCustomer={(customer) => {
                  if (customer) {
                    setCustomerId(customer.id);
                    setCustomerNameError(null);
                  }
                }}
                onAddNewCustomer={() => setShowQuickAddModal(true)}
                placeholder="התחל להקליד שם לקוח..."
              />
            </div>
          </FieldWrapper>

          <FieldWrapper label="תאריך מסמך" required id="documentDate">
            <DateInput
              id="documentDate"
              value={documentDate}
              onChange={(value) => {
                // Ensure date is not before minAllowedDate
                if (minAllowedDate && value < minAllowedDate) {
                  setDocumentDate(minAllowedDate)
                } else {
                  setDocumentDate(value)
                }
              }}
              min={minAllowedDate || undefined}
              aria-required="true"
            />
          </FieldWrapper>
          </div>
        </FormSection>

        {/* Document Details */}
        <FormSection 
          title="פרטי המסמך"
          description="תיאור התשלום או השירות"
        >
        <FieldWrapper 
          label="תיאור" 
          required 
          error={descriptionError}
          id="description"
          hint="מינימום 5 תווים - לדוגמה: שירותי עיצוב גרפי"
          className="ui-field-wide"
        >
          <Input
            id="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (descriptionError && e.target.value.trim().length >= 5) {
                setDescriptionError(null);
              }
            }}
            placeholder="הזן תיאור..."
            className={descriptionError ? "border-danger" : ""}
            aria-required="true"
            aria-invalid={!!descriptionError}
            aria-describedby={descriptionError ? "description-error" : "description-hint"}
          />
        </FieldWrapper>
        </FormSection>

        {/* Payments Section */}
        <FormSection 
          title="פירוט תקבולים"
          description="איך שילמו לך? אפשר לבחור מספר צורות תשלום שונות"
        >
          <div ref={paymentsTableRef} className="space-y-[50px]">
            {Object.keys(paymentErrors).length > 0 && (
              <div 
                style={{ 
                  backgroundColor: '#FEF2F2', 
                  border: '1px solid #9B0003',
                  borderRadius: '8px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#9B0003' }}>
                    יש לתקן את השדות המסומנים באדום
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-[50px]">
              {payments.map((row, i) => (
                <div key={i} className="relative" style={{ 
                  backgroundColor: 'white', 
                  borderRadius: '20px', 
                  boxShadow: '0 0 13px 0 rgba(0, 0, 0, 0.10)', 
                  border: 'none',
                  padding: '30px 50px',
                }}>
                  {/* Delete Button - Icon Only, Absolutely Positioned */}
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePaymentRow(i)}
                      aria-label="מחיקה"
                      className="absolute top-3 left-3 text-danger hover:text-danger hover:bg-danger/10"
                      title="מחק"
                      style={{ color: '#9B0003' }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <div>
                    <div className="ui-form-grid">
                  <FieldWrapper 
                    label="אמצעי תשלום" 
                    required
                    error={paymentErrors[i]?.method}
                    id={`payment-method-${i}`}
                  >
                    <Select
                      value={row.method}
                      onValueChange={(v) => {
                        updatePaymentRow(i, { method: v as any });
                        if (paymentErrors[i]?.method) {
                          const newErrors = { ...paymentErrors };
                          if (newErrors[i]) {
                            delete newErrors[i].method;
                            if (Object.keys(newErrors[i]).length === 0) {
                              delete newErrors[i];
                            }
                          }
                          setPaymentErrors(newErrors);
                        }
                      }}
                    >
                      <SelectTrigger 
                        id={`payment-method-${i}`}
                        className={paymentErrors[i]?.method ? "border-danger" : ""}
                        aria-required="true"
                        aria-invalid={!!paymentErrors[i]?.method}
                        aria-describedby={paymentErrors[i]?.method ? `payment-method-${i}-error` : undefined}
                      >
                        <SelectValue placeholder="בחר אמצעי תשלום..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  <FieldWrapper label="תאריך תשלום" required id={`payment-date-${i}`}>
                    <DateInput
                      id={`payment-date-${i}`}
                      value={row.date}
                      onChange={(value) => updatePaymentRow(i, { date: value })}
                      aria-required="true"
                    />
                  </FieldWrapper>

                  <FieldWrapper 
                    label="סכום" 
                    required
                    error={paymentErrors[i]?.amount}
                    id={`payment-amount-${i}`}
                    className="!w-full"
                  >
                    <div className="flex gap-2" style={{ alignItems: 'center' }}>
                      <MoneyInput
                        id={`payment-amount-${i}`}
                        value={row.amount}
                        onChange={(v) => {
                          updatePaymentRow(i, { amount: v });
                          if (paymentErrors[i]?.amount && v > 0) {
                            const newErrors = { ...paymentErrors };
                            if (newErrors[i]) {
                              delete newErrors[i].amount;
                              if (Object.keys(newErrors[i]).length === 0) {
                                delete newErrors[i];
                              }
                            }
                            setPaymentErrors(newErrors);
                          }
                        }}
                        currency={row.currency}
                        error={!!paymentErrors[i]?.amount}
                        style={{ 
                          flex: '1',
                          fontSize: '18px',
                          fontWeight: 600,
                        }}
                        aria-required={true}
                        aria-invalid={!!paymentErrors[i]?.amount}
                        aria-describedby={paymentErrors[i]?.amount ? `payment-amount-${i}-error` : undefined}
                      />
                      <Select
                        value={row.currency}
                        onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                      >
                        <SelectTrigger 
                          style={{ 
                            width: '80px',
                            minWidth: '80px',
                            fontSize: '18px',
                            fontWeight: 600,
                          }} 
                          aria-label="מטבע"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedCurrencies.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </FieldWrapper>
                    </div>

                    <div className="mt-[50px]">
                      <PaymentDetailsSection
                        payment={row}
                        onUpdate={(updates) => updatePaymentRow(i, updates)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPaymentRow}
              className="mt-[50px]"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                color: '#19183B',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                fontWeight: 500,
              }}
            >
              הוספת תקבול
            </button>

            <div className="pt-[50px] mt-[50px] border-t" style={{ borderColor: '#EDF1F5' }}>
              <div className="flex justify-between items-center">
                <div className="text-lg font-bold" style={{ color: '#19183B' }}>סה״כ שולם</div>
                <div className="text-2xl font-bold" style={{ color: '#19183B' }}>{formatMoney(total, currency)}</div>
              </div>
              {roundTotals && (
                <p className="text-xs mt-2 text-right" style={{ color: '#19183B', opacity: 0.8 }}>כולל עיגול לסכום סופי</p>
              )}
            </div>
          </div>
        </FormSection>

        {/* Notes Section */}
        <FormSection 
          title="הערות"
        >
        <FieldWrapper 
          label="הערות שיופיעו במסמך" 
          id="notes"
          className="ui-field-wide"
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="חשוב לדעת..."
            className="min-h-[100px] resize-y"
            aria-describedby="notes-hint"
          />
        </FieldWrapper>
        </FormSection>

        {/* Action Buttons */}
        <div className="mt-10">
          <FormActions
            primaryLabel={busy === "issue" ? "יוצר קבלה..." : "יצירת קבלה"}
            secondaryLabel={busy === "draft" ? "שומר בטיוטות..." : "שמירה בטיוטות"}
            onPrimaryClick={onIssue}
            onSecondaryClick={onSaveDraft}
            primaryLoading={busy === "issue"}
            secondaryLoading={busy === "draft"}
            primaryDisabled={busy != null || !sequenceLocked}
            secondaryDisabled={busy != null}
            primaryType="button"
          />
        </div>
      </form>

        {/* Message Alert */}
        {message && (
          <Card className={cn(
            "mt-[50px]",
            message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
          )}>
            <CardContent className="p-4">
              <div className={cn(
                "flex items-center gap-3 font-medium",
                message.includes("שגיאה") ? "text-danger" : "text-success"
              )}>
                {message.includes("שגיאה") && "⚠️"}
                {!message.includes("שגיאה") && "✓"}
                <span>{message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer Text from Admin Settings */}
        {footerText && footerText.trim() && (
          <Card className="mt-[50px]">
            <CardHeader>
              <CardTitle className="text-base">📌 הערות מערכת</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-fg whitespace-pre-wrap leading-relaxed">
                {footerText}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Add Customer Modal */}
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

      {/* Starting Number Modal - Opens on first receipt creation */}
      {showStartingNumberModal && (
        <StartingNumberModal
          documentType="receipt"
          onClose={() => {
            // User cancelled - redirect back to documents list
            window.location.href = "/dashboard/documents";
          }}
          onSuccess={() => {
            // Sequence is now locked, refresh page to get new sequence info
            setShowStartingNumberModal(false);
            setSequenceLocked(true);
            window.location.reload();
          }}
        />
      )}

      {/* Success Modal - Receipt Created Successfully */}
      {successModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(25, 24, 59, 0.9)' }}
          onClick={() => {
            setSuccessModal(null);
            window.location.href = "/dashboard/documents";
          }}
          dir="rtl"
        >
          <div
            style={{
              background: '#EDF1F5',
              borderRadius: '20px',
              boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
              width: '100%',
              maxWidth: '420px',
              padding: '50px',
              textAlign: 'center',
              color: '#19183B',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Success Icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto', height: 80 }}>
              <CheckCircle2 
                size={80} 
                style={{ color: '#1D868F' }}
              />
            </div>
            {/* Title */}
            <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: 0, color: '#19183B' }}>
              יצרת בהצלחה קבלה!
            </div>
            {/* Receipt Number */}
            <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: 24, color: '#19183B' }}>
              מספר קבלה: <span style={{ fontWeight: 900 }}>{successModal.documentNumber}</span>
            </div>
            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', marginBottom: 24 }}>
              {/* Primary Button - Download PDF */}
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const pdfUrl = `/api/receipts/${successModal.receiptId}/pdf`;
                    const response = await fetch(pdfUrl);
                    
                    if (!response.ok) {
                      throw new Error(`PDF download failed: ${response.statusText}`);
                    }
                    
                    const blob = await response.blob();
                    
                    if (blob.size === 0) {
                      throw new Error("Downloaded PDF is empty");
                    }
                    
                    const pdfBlob = new Blob([blob], { type: "application/pdf" });
                    const downloadUrl = window.URL.createObjectURL(pdfBlob);
                    const link = document.createElement("a");
                    link.href = downloadUrl;
                    link.download = `receipt-${successModal.documentNumber}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                    
                    // Close modal and redirect to dashboard after download
                    setTimeout(() => {
                      setSuccessModal(null);
                      window.location.href = "/dashboard/documents";
                    }, 500);
                  } catch (error: any) {
                    alert(`שגיאה בהורדת PDF: ${error.message}`);
                  }
                }}
                style={{
                  width: '300px',
                }}
              >
                להורדת הקבלה
              </Button>
              
              {/* Secondary Button - View Receipt */}
              <Button
                variant="secondary"
                onClick={() => {
                  const previewData = {
                    previewNumber: successModal.documentNumber,
                    companyName: successModal.companyName,
                    customerName: successModal.payload.customerName,
                    customerId: successModal.payload.customerId || "",
                    documentDate: successModal.payload.documentDate,
                    description: successModal.payload.description || "",
                    notes: successModal.payload.notes,
                    footerNotes: successModal.payload.notes,
                    total: String(successModal.payload.total),
                    currency: successModal.payload.currency,
                    payments: JSON.stringify(successModal.payload.payments),
                  };
                  const params = new URLSearchParams(previewData as any);
                  window.open(`/dashboard/documents/receipt/preview?${params.toString()}`, "_blank");
                }}
                style={{
                  width: '300px',
                }}
              >
                צפייה בקבלה
              </Button>
            </div>
            {/* Close as text button */}
            <div style={{ textAlign: 'center', marginTop: 0 }}>
              <button
                onClick={() => {
                  setSuccessModal(null);
                  window.location.href = "/dashboard/documents";
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#19183B',
                  fontSize: 18,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  margin: '0 auto',
                  display: 'block',
                  fontWeight: 500,
                }}
              >
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
