"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
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
  const [documentType, setDocumentType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [dataScope, setDataScope] = useState<"10000" | "500000">("10000");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate) {
      setMessage({ type: "error", text: "נא למלא את שדות התאריך" });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      // Import the action dynamically
      const { generateIncomeReportAction } = await import("../actions");
      
      const result = await generateIncomeReportAction({
        startDate,
        endDate,
        documentTypes: documentType === "all" ? [] : [documentType],
        customerName: customerSearch || undefined,
        fileFormat,
        scope: dataScope,
        emails: emails.length > 0 ? emails : undefined,
      });

      if (result.ok) {
        const monthText = result.totalMonths === 1 ? "חודש אחד" : `${result.totalMonths} חודשים`;
        setMessage({
          type: "success",
          text: `הדוח הופק בהצלחה! עסק: ${result.companyName}, תקופה: ${monthText}, סה"כ מסמכים: ${result.reports?.reduce((sum: number, r: any) => sum + r.documentCount, 0) || 0}. ההורדה תתחיל בקרוב...`
        });
        
        // TODO: Trigger actual PDF download here
        console.log("Generated reports:", result.reports);
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

  const isFormValid = startDate && endDate;

  return (
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
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
          <h1 className="text-right text-4xl font-semibold text-[#19183B] mb-4">
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
            <div className="ui-form-grid">
              <FieldWrapper label="סוג מסמך" id="documentType">
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger id="documentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="תאריך התחלה" required id="startDate">
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-required="true"
                />
              </FieldWrapper>

              <FieldWrapper label="תאריך סיום" required id="endDate">
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-required="true"
                />
              </FieldWrapper>
            </div>
          </FormSection>

          {/* Customer Search */}
          <FormSection title="סינון לפי לקוח">
            <FieldWrapper 
              label="דוח לפי לקוח" 
              id="customerSearch"
              hint="אם השדה ריק, הדוח יופק עבור כל הלקוחות"
              className="ui-field-wide"
            >
              <Input
                id="customerSearch"
                type="text"
                placeholder="הקלד שם לקוח לסינון (אופציונלי)"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </FieldWrapper>
          </FormSection>

          {/* File Format & Data Scope */}
          <FormSection title="הגדרות קובץ">
            <div className="ui-form-grid">
              <FieldWrapper label="סוג קובץ" id="fileFormat">
                <Select value={fileFormat} onValueChange={setFileFormat}>
                  <SelectTrigger id="fileFormat">
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
              </FieldWrapper>

              <FieldWrapper label="היקף נתונים" id="dataScope" className="!w-full">
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
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#1D868F', borderRadius: '8px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                    <AlertCircle className="h-4 w-4" style={{ color: '#FFFFFF', marginTop: '2px', flexShrink: 0 }} />
                    <p style={{ fontSize: '14px', color: '#FFFFFF' }}>
                      בהפקת דוח PDF שעולה מעל 300 מסמכים, יופק רק עמוד סיכום ללא פירוט המסמכים
                    </p>
                  </div>
                )}
              </FieldWrapper>
            </div>
          </FormSection>

          {/* Email Tags */}
          <FormSection title="שליחת דוח במייל">
            <FieldWrapper 
              label="כתובת מייל לשליחת הדוח" 
              id="emailInput"
              hint="ניתן להזין עד 5 כתובות מייל. הדוח יישלח גם למייל וגם יורד אוטומטית למחשב שלך"
              className="ui-field-wide"
            >
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

                {/* Email Input */}
                <Input
                  id="emailInput"
                  type="email"
                  placeholder="הזן כתובת מייל ולחץ Enter"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={handleAddEmail}
                  disabled={emails.length >= 5}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </div>
            </FieldWrapper>
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
      </div>
    </main>
  );
}
