"use client";

import { useState, FormEvent } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface IncomeReportModalProps {
  onClose: () => void;
}

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
  { value: "hashavshevet", label: "חשבשבת" },
  { value: "priority", label: "פריוריטי" },
  { value: "sap", label: "SAP" },
];

export default function IncomeReportModal({ onClose }: IncomeReportModalProps) {
  const [documentType, setDocumentType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [dataScope, setDataScope] = useState<"10000" | "500000">("10000");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      alert("נא למלא את שדות התאריך");
      return;
    }

    setIsSubmitting(true);

    try {
      // Import the action dynamically
      const { generateIncomeReportAction } = await import("./actions");
      
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
        alert(
          `הדוח הופק בהצלחה!\n\n` +
          `עסק: ${result.companyName}\n` +
          `תקופה: ${monthText}\n` +
          `סה"כ מסמכים: ${result.reports?.reduce((sum: number, r: any) => sum + r.documentCount, 0) || 0}\n\n` +
          `ההורדה תתחיל בקרוב...`
        );
        
        // TODO: Trigger actual PDF download here
        console.log("Generated reports:", result.reports);
        
        onClose();
      } else {
        alert(`שגיאה בהפקת הדוח: ${result.error}`);
      }
    } catch (error: any) {
      console.error("Report generation error:", error);
      alert(`שגיאה: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = startDate && endDate;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-overlay z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-fg">
              דוח הכנסות להנהלת חשבונות
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="סגירה"
            >
              <X className="h-5 w-5 text-muted-fg" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Document Type & Period */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="ui-label-dark">סוג מסמך</label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger>
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
              </div>

              <div>
                <label className="ui-label-dark">תקופה</label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1"
                    required
                  />
                  <span className="text-muted-fg flex items-center">-</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Customer Search */}
            <div>
              <label className="ui-label-dark">דוח לפי לקוח</label>
              <Input
                type="text"
                placeholder="הקלד שם לקוח לסינון (אופציונלי)"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <p className="text-xs text-muted-fg mt-1">
                אם השדה ריק, הדוח יופק עבור כל הלקוחות
              </p>
            </div>

            {/* File Format */}
            <div>
              <label className="ui-label-dark">סוג קובץ</label>
              <Select value={fileFormat} onValueChange={setFileFormat}>
                <SelectTrigger>
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

            {/* Data Scope */}
            <div>
              <label className="ui-label-dark mb-3 block">היקף נתונים</label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition-colors">
                  <input
                    type="radio"
                    name="dataScope"
                    value="10000"
                    checked={dataScope === "10000"}
                    onChange={(e) => setDataScope(e.target.value as "10000")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-fg font-medium">הקובץ מכיל עד 10,000 מסמכים</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition-colors">
                  <input
                    type="radio"
                    name="dataScope"
                    value="500000"
                    checked={dataScope === "500000"}
                    onChange={(e) => setDataScope(e.target.value as "500000")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-fg font-medium">הקובץ מכיל עד 500,000 מסמכים</div>
                  </div>
                </label>
              </div>

              {/* Info Message */}
              {fileFormat === "pdf" && (
                <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-primary-fg mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-primary-fg">
                    בהפקת דוח PDF שעולה מעל 300 מסמכים, יופק רק עמוד סיכום ללא פירוט המסמכים
                  </p>
                </div>
              )}
            </div>

            {/* Email Tags */}
            <div>
              <label className="ui-label-dark">כתובת מייל לשליחת הדוח</label>
              <div className="space-y-2">
                {/* Email Tags */}
                {emails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {emails.map((email, index) => (
                      <div
                        key={index}
                        className="inline-flex items-center gap-1 bg-muted text-fg px-3 py-1 rounded-full text-sm"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(index)}
                          className="hover:bg-muted/80 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Email Input */}
                <Input
                  type="email"
                  placeholder="הזן כתובת מייל ולחץ Enter"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={handleAddEmail}
                  disabled={emails.length >= 5}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <p className="text-xs text-muted-fg mt-1">
                ניתן להזין עד 5 כתובות מייל. הדוח יישלח גם למייל וגם יורד אוטומטית למחשב שלך
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="flex-1 ui-button-dark"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    מפיק דוח...
                  </>
                ) : (
                  "הפקת הדוח"
                )}
              </Button>
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                disabled={isSubmitting}
                className="ui-button-dark-secondary"
              >
                ביטול
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
