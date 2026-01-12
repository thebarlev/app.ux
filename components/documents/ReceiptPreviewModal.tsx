"use client";

import { X, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl?: string; // TODO: Replace placeholder with real PDF bytes from API endpoint
  isLoading?: boolean;
  error?: string | null;
  // NOTE: Watermark is CSS overlay ONLY - not embedded into PDF output
  // Future: Consider adding embedWatermark prop to optionally embed watermark in server-generated PDF
};

export default function ReceiptPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  isLoading = false,
  error = null,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

    // Focus the close button when modal opens
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
      role="presentation"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="w-full max-w-4xl bg-modal rounded-[20px] shadow-xl relative text-modal-fg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        aria-describedby="preview-modal-description"
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
        <div className="p-8">
          {/* Title */}
          <h2
            id="preview-modal-title"
            className="text-2xl font-bold text-modal-fg mb-6 text-center"
          >
            תצוגה מקדימה
          </h2>

          {/* PDF Container with Watermark Overlay */}
          <div className="relative bg-white rounded-lg overflow-hidden" style={{ minHeight: "600px" }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-modal-fg">טוען תצוגה מקדימה...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                <div className="text-center p-8">
                  <p className="text-red-600 font-medium mb-4">לא הצלחנו ליצור תצוגה מקדימה</p>
                  <p className="text-sm text-muted-fg">{error}</p>
                </div>
              </div>
            )}

            {!isLoading && !error && pdfUrl && (
              <>
                {/* Preview iframe - loads HTML preview page */}
                <iframe
                  src={pdfUrl}
                  className="w-full h-full"
                  style={{ minHeight: "600px", border: "none" }}
                  title="תצוגה מקדימה של הקבלה"
                  aria-label="תצוגה מקדימה של הקבלה"
                  onLoad={() => {
                    console.log("[ReceiptPreviewModal] Preview iframe loaded successfully");
                  }}
                  onError={(e) => {
                    console.error("[ReceiptPreviewModal] Preview iframe error:", e);
                  }}
                />

                {/* Watermark CSS Overlay - UI ONLY, not embedded in PDF */}
                {/* NOTE: This watermark is CSS overlay only. It does NOT appear in the actual PDF file. */}
                {/* Future: If embedWatermark=true, server should embed watermark during PDF generation */}
                <div
                  className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
                  style={{
                    transform: "rotate(-45deg)",
                  }}
                  aria-hidden="true"
                >
                  <span
                    className="text-6xl font-bold"
                    style={{
                      color: "rgba(0, 0, 0, 0.15)",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    להמחשה בלבד
                  </span>
                </div>
              </>
            )}

            {!isLoading && !error && !pdfUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-muted-fg">טוען PDF...</p>
              </div>
            )}
          </div>

          {/* Info Text */}
          <p id="preview-modal-description" className="text-sm text-muted-fg text-center mt-4">
            זהו תצוגה מקדימה בלבד. המסמך הסופי יופק רק לאחר לחיצה על "הפקת מסמך".
          </p>
        </div>
      </div>
    </div>
  );
}
