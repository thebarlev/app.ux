"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
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
        className="w-full max-w-[500px] bg-modal rounded-[20px] shadow-xl relative text-modal-fg"
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
          className="absolute top-4 left-4 z-10 p-2 rounded-full hover:bg-black/10 transition-colors disabled:opacity-50"
          aria-label="סגירה"
        >
          <X className="h-5 w-5 text-modal-fg" />
        </button>

        {/* Modal Content */}
        <div className="flex flex-col h-full">
          <div className="p-8 text-center flex-1">
            {/* Description - ABOVE title */}
            <div
              id="confirmation-modal-description"
              className="mb-6 p-4 mx-auto max-w-[500px]"
            >
              <div className="flex flex-col items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-yellow-700 flex-shrink-0" aria-hidden="true" />
                <p className="text-yellow-900 leading-relaxed" style={{ fontSize: "18px" }}>
                  רגע לפני שמאשרים שווה לעבור פעם נוספת על הפרטים ולוודא שהם נכונים, כי אחרי הפקת המסמך אי אפשר יהיה לתקן אותו.
                </p>
              </div>
            </div>

            {/* Title */}
            <h2
              id="confirmation-modal-title"
              className="text-2xl font-bold text-modal-fg mb-8"
            >
              אישור הפקת קבלה
            </h2>

            {/* Document Info - Horizontal row layout, centered, 18px font */}
            <div className="mb-6 flex flex-row items-center justify-center gap-5 mx-auto max-w-[500px] flex-nowrap">
              <div className="flex flex-col items-center py-2">
                <span className="text-muted-fg font-medium mb-1" style={{ fontSize: "18px" }}>תאריך המסמך:</span>
                <span className="text-modal-fg font-semibold" style={{ fontSize: "18px" }}>{formatDate(documentDate)}</span>
              </div>
              <div className="flex flex-col items-center py-2">
                <span className="text-muted-fg font-medium mb-1" style={{ fontSize: "18px" }}>שם הלקוח:</span>
                <span className="text-modal-fg font-semibold" style={{ fontSize: "18px" }}>{customerName}</span>
              </div>
              <div className="flex flex-col items-center py-2">
                <span className="text-muted-fg font-medium mb-1" style={{ fontSize: "18px" }}>סכום מסמך:</span>
                <span className="text-modal-fg font-semibold" style={{ fontSize: "18px" }}>{formatMoney(total, currency)}</span>
              </div>
            </div>

            {/* Email Note - Blue background, aligned with background */}
            {!hasEmail && (
              <div className="p-3 rounded-lg mx-auto max-w-[500px]" style={{ backgroundColor: "#DBEAFE", border: "1px solid #93C5FD" }}>
                <p className="text-blue-900" style={{ fontSize: "18px" }}>
                  רק אומרים שלא הזנת כתובת מייל לשליחת המסמך (אבל אפשר להפיק אותו ולשלוח אחר כך)
                </p>
              </div>
            )}

            {/* Consent (computerized document) - TEMP: deferred when consentState is not provided */}
            {consentState && (
              <div className="mt-6 mx-auto max-w-[500px] text-right">
                {consentState.status === "loading" && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "#F3F4F6", border: "1px solid #E5E7EB" }}>
                  <p className="text-modal-fg" style={{ fontSize: "18px" }}>
                    טוען סטטוס הסכמה…
                  </p>
                </div>
                )}

                {consentState.status === "error" && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "#FEE2E2", border: "1px solid #FCA5A5" }}>
                  <p className="text-red-900" style={{ fontSize: "18px" }}>
                    {consentState.message || "שגיאה בבדיקת הסכמה"}
                  </p>
                </div>
                )}

                {consentState.status === "ready" && (
                <div className="p-4 rounded-lg" style={{ backgroundColor: "#EDF2FF", border: "1px solid #C7D2FE" }}>
                  <div className="flex items-start gap-3">
                    {consentRequired ? (
                      <Checkbox
                        checked={consentChecked}
                        onCheckedChange={(v) => onConsentCheckedChange?.(v === true)}
                        className="mt-1"
                      />
                    ) : (
                      <Checkbox checked disabled className="mt-1" />
                    )}

                    <div className="flex-1">
                      <p className="text-modal-fg leading-relaxed" style={{ fontSize: "18px" }}>
                        אני מאשר/ת שקיבלתי הסכמה מפורשת מהמקבל לקבלת מסמך ממוחשב (חתום) באמצעים דיגיטליים.
                      </p>
                      {consentState.recipientIdentifier && (
                        <p className="text-muted-fg mt-2" style={{ fontSize: "14px" }} dir="ltr">
                          Recipient: {consentState.recipientIdentifier}
                        </p>
                      )}
                      {!consentRequired && onRevokeConsent && (
                        <button
                          type="button"
                          onClick={onRevokeConsent}
                          className="mt-3 text-sm underline"
                          style={{ color: "#B91C1C" }}
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
          <div className="p-8 pt-0 flex flex-col gap-4 items-center border-t" style={{ borderColor: "#E5E7EB" }}>
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
