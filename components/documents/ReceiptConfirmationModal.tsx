"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";

const DOCUMENT_TYPE_LABELS = {
  invoice: "חשבונית מס",
  tax_invoice: "חשבונית מס",
  invoiceReceipt: "חשבונית מס / קבלה",
  creditNote: "חשבונית זיכוי",
  receipt: "קבלה",
  quote: "הצעת מחיר",
  proforma: "חשבון עסקה (דרישת תשלום)",
  workOrder: "הזמנת עבודה",
  deliveryNote: "תעודת משלוח",
  returnNote: "תעודת החזרה",
  purchaseOrder: "הזמנת רכש",
  selfInvoice: "חשבונית עצמית",
  selfCreditNote: "חשבונית זיכוי עצמית",
} as const;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  documentType?: keyof typeof DOCUMENT_TYPE_LABELS;
  titleOverride?: string;
  documentDate: string;
  customerName: string;
  total: number;
  currency: string;
  isLoading?: boolean;
  hasEmail?: boolean;
  isFinalizing?: boolean;
  consentState?: {
    status: "idle" | "loading" | "ready" | "error";
    hasConsent: boolean;
    recipientIdentifier: string | null;
    message?: string;
  };
  consentChecked?: boolean;
  onConsentCheckedChange?: (next: boolean) => void;
  onRevokeConsent?: () => void;
};

export default function ReceiptConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  documentType,
  titleOverride,
  documentDate,
  customerName,
  total,
  currency,
  isLoading = false,
  hasEmail = false,
  isFinalizing = false,
  consentState,
  consentChecked = false,
  onConsentCheckedChange,
  onRevokeConsent,
}: Props) {
  const documentLabel = documentType ? DOCUMENT_TYPE_LABELS[documentType] : "מסמך";
  const titleText = titleOverride || `אישור הפקת ${documentLabel}`;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    console.log("[FINALIZE_RECEIPT] Modal opened", { isOpen, isLoading, isFinalizing });

    // Store the element that had focus before modal opened
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        console.log("[FINALIZE_RECEIPT] Escape key pressed", { isLoading, isFinalizing });
        if (!isLoading && !isFinalizing) {
          onClose();
        } else {
          console.log("[FINALIZE_RECEIPT] Blocking escape - finalization in progress");
          e.preventDefault();
        }
      }
    };

    // Focus trap: Tab key should cycle within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as NodeListOf<HTMLElement>;
      
      if (!focusableElements || focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    closeButtonRef.current?.focus();
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "unset";
      
      // Return focus to the element that opened the modal
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, isLoading, isFinalizing, onClose]);

  if (!isOpen) return null;

  // Format date for display (DD/MM/YYYY)
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  // Format money
  const formatMoney = (amount: number, curr: string) => {
    return `${curr}${amount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
  };

  const consentRequired = consentState?.status === "ready" && !consentState.hasConsent;
  const consentBlocking =
    consentState?.status === "loading" ||
    consentState?.status === "error" ||
    (consentRequired && !consentChecked);

  return (
    <div
      className="receipt-confirmation-overlay fixed inset-0 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          console.log("[FINALIZE_RECEIPT] Overlay clicked", { isLoading, isFinalizing });
          if (!isLoading && !isFinalizing) {
            onClose();
          } else {
            console.log("[FINALIZE_RECEIPT] Blocking overlay close - finalization in progress");
          }
        }
      }}
      role="presentation"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="receipt-confirmation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-description"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          disabled={isLoading}
          className="receipt-confirmation-close"
          aria-label="סגירה"
        >
          <X className="h-5 w-5 text-modal-fg" />
        </button>

        {/* Modal Content */}
        <div className="receipt-confirmation-content">
          <div className="receipt-confirmation-body">
            {/* Description - ABOVE title */}
            <div
              id="confirmation-modal-description"
              className="receipt-confirmation-description"
            >
              <div className="receipt-confirmation-warning">
                <AlertTriangle className="receipt-confirmation-warning-icon" aria-hidden="true" />
                <p className="receipt-confirmation-warning-text">
                  רגע לפני שמאשרים שווה לעבור פעם נוספת על הפרטים ולוודא שהם נכונים, כי אחרי הפקת המסמך אי אפשר יהיה לתקן אותו.
                </p>
              </div>
            </div>

            {/* Title */}
            <h2
              id="confirmation-modal-title"
              className="receipt-confirmation-title"
            >
              {titleText}
            </h2>

            {/* Document Info - Horizontal row layout, centered, 18px font */}
            <div className="receipt-confirmation-summary">
              <div className="receipt-confirmation-summary-item">
                <span className="receipt-confirmation-summary-label">תאריך המסמך</span>
                <span className="receipt-confirmation-summary-value">{formatDate(documentDate)}</span>
              </div>
              <div className="receipt-confirmation-summary-item">
                <span className="receipt-confirmation-summary-label">שם הלקוח</span>
                <span className="receipt-confirmation-summary-value">{customerName}</span>
              </div>
              <div className="receipt-confirmation-summary-item">
                <span className="receipt-confirmation-summary-label">סכום מסמך</span>
                <span className="receipt-confirmation-summary-value">{formatMoney(total, currency)}</span>
              </div>
            </div>

            {consentState && (
              <div className="receipt-confirmation-consent">
                {consentState.status === "loading" && (
                <div className="receipt-confirmation-consent-loading">
                  <p className="receipt-confirmation-consent-text">
                    טוען סטטוס הסכמה…
                  </p>
                </div>
                )}

                {consentState.status === "error" && (
                <div className="receipt-confirmation-consent-error">
                  <p className="receipt-confirmation-consent-error-text">
                    {consentState.message || "שגיאה בבדיקת הסכמה"}
                  </p>
                </div>
                )}

                {consentState.status === "ready" && (
                <div className="receipt-confirmation-consent-ready">
                  <div className="receipt-confirmation-consent-row">
                    {consentRequired ? (
                      <Checkbox
                        checked={consentChecked}
                        onCheckedChange={(v) => onConsentCheckedChange?.(v === true)}
                        className="mt-1"
                      />
                    ) : (
                      <Checkbox checked disabled className="mt-1" />
                    )}

                    <div className="receipt-confirmation-consent-body">
                      <p className="receipt-confirmation-consent-text">
                        אני מאשר/ת שקיבלתי הסכמה מפורשת מהמקבל לקבלת מסמך ממוחשב (חתום) באמצעים דיגיטליים.
                      </p>
                      {consentState.recipientIdentifier && (
                        <p className="receipt-confirmation-recipient" dir="ltr">
                          Recipient: {consentState.recipientIdentifier}
                        </p>
                      )}
                      {!consentRequired && onRevokeConsent && (
                        <button
                          type="button"
                          onClick={onRevokeConsent}
                          className="receipt-confirmation-revoke"
                          disabled={isLoading || isFinalizing}
                        >
                          ביטול הסכמה
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons - Footer at bottom, RTL aligned */}
          <div className="receipt-confirmation-footer">
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="primary"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("[FINALIZE_RECEIPT] Confirm button clicked", { 
                  isLoading, 
                  isFinalizing,
                  customerName,
                  total,
                  currency
                });
                try {
                  await onConfirm();
                  console.log("[FINALIZE_RECEIPT] onConfirm handler completed");
                } catch (error: any) {
                  console.error("[FINALIZE_RECEIPT] Error in onConfirm handler", { 
                    error: error.message,
                    stack: error.stack 
                  });
                }
              }}
              disabled={isLoading || isFinalizing || consentBlocking}
              loading={isLoading || isFinalizing}
              className="w-full max-w-[300px]"
            >
              {(isLoading || isFinalizing) ? "מפיק..." : "לאישור והפקה"}
            </Button>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
              className="w-full max-w-[300px]"
            >
              חזרה לעריכה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
