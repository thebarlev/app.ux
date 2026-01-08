"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

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
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    // Store the element that had focus before modal opened
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
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
  }, [isOpen, isLoading, onClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
      role="presentation"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="w-full max-w-[500px] bg-[#EDF1F5] rounded-[20px] shadow-xl relative"
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
          <X className="h-5 w-5 text-[#19183B]" />
        </button>

        {/* Modal Content */}
        <div className="p-8 text-center">
          {/* Title */}
          <h2
            id="confirmation-modal-title"
            className="text-2xl font-bold text-[#19183B] mb-8"
          >
            אישור הפקת חשבונית מס / קבלה
          </h2>

          {/* Action Buttons - Primary button first, secondary below */}
          <div className="mb-8 flex flex-col gap-4 items-center">
            <Button
              ref={confirmButtonRef}
              variant="primary"
              onClick={onConfirm}
              disabled={isLoading}
              loading={isLoading}
              className="w-full max-w-[300px]"
            >
              {isLoading ? "מפיק..." : "לאישור והפקה"}
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

          {/* Warning Box - Centered, 18px font, icon on top */}
          <div
            id="confirmation-modal-description"
            className="mb-6 p-4 rounded-lg mx-auto max-w-[500px]"
            style={{ backgroundColor: "#FEF3C7", border: "1px solid #FCD34D" }}
          >
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-700 flex-shrink-0" aria-hidden="true" />
              <p className="text-yellow-900 leading-relaxed" style={{ fontSize: "18px" }}>
                רגע לפני שמאשרים שווה לעבור פעם נוספת על הפרטים ולוודא שהם נכונים, כי אחרי הפקת המסמך אי אפשר יהיה לתקן אותו.
              </p>
            </div>
          </div>

          {/* Document Info - Each item below the other, centered, 18px font */}
          <div className="mb-6 space-y-4 mx-auto max-w-[500px]">
            <div className="flex flex-col items-center py-2">
              <span className="text-[#708993] font-medium mb-1" style={{ fontSize: "18px" }}>תאריך המסמך:</span>
              <span className="text-[#19183B] font-semibold" style={{ fontSize: "18px" }}>{formatDate(documentDate)}</span>
            </div>
            <div className="flex flex-col items-center py-2">
              <span className="text-[#708993] font-medium mb-1" style={{ fontSize: "18px" }}>שם הלקוח:</span>
              <span className="text-[#19183B] font-semibold" style={{ fontSize: "18px" }}>{customerName}</span>
            </div>
            <div className="flex flex-col items-center py-2">
              <span className="text-[#708993] font-medium mb-1" style={{ fontSize: "18px" }}>סכום מסמך:</span>
              <span className="text-[#19183B] font-semibold" style={{ fontSize: "18px" }}>{formatMoney(total, currency)}</span>
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
        </div>
      </div>
    </div>
  );
}
