"use client";

import { X, CheckCircle2, Eye, Download, FileText, Send, MessageCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  documentNumber: string;
  companyName: string;
  documentId: string;
  onViewDocument: () => void;
  onDownloadOriginal: () => void;
};

export default function ReceiptSuccessModal({
  isOpen,
  onClose,
  documentNumber,
  companyName,
  documentId,
  onViewDocument,
  onDownloadOriginal,
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
      if (e.key === "Escape") {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // WhatsApp share handler
  const handleWhatsAppShare = () => {
    // TODO: Generate signed URL from /api/documents/{documentId}/pdf and create share link
    // The signed URL should have longer TTL (e.g., 24 hours) for sharing
    // Current implementation uses placeholder URL - replace with actual signed URL
    const message = `מצורפת קבלה מספר ${documentNumber}`;
    const url = encodeURIComponent(window.location.origin + `/dashboard/documents/${documentId}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(message + " " + url)}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="w-full max-w-[500px] bg-[#EDF1F5] rounded-[20px] shadow-xl relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
        aria-describedby="success-modal-description"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 left-4 z-10 p-2 rounded-full hover:bg-black/10 transition-colors"
          aria-label="סגירה"
        >
          <X className="h-5 w-5 text-[#19183B]" />
        </button>

        {/* Modal Content */}
        <div className="p-8 text-center">
          {/* Success Icon */}
          <div className="flex items-center justify-center mb-6">
            <CheckCircle2 className="h-20 w-20 text-[#1D868F]" />
          </div>

          {/* Title */}
          <h2
            id="success-modal-title"
            className="text-2xl font-bold text-[#19183B] mb-2"
          >
            חשבונית עסקה מספר {documentNumber} | {companyName}
          </h2>

          {/* Actions Grid */}
          <div className="mt-8 mb-6">
            <div className="grid grid-cols-3 gap-4">
              {/* Row 1 */}
              <button
                onClick={onViewDocument}
                className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-white/50 transition-colors"
                title="צפייה בעמוד המסמך"
              >
                <Eye className="h-6 w-6 text-[#19183B]" />
                <span className="text-xs text-[#19183B]">צפייה בעמוד המסמך</span>
              </button>

              <button
                onClick={onDownloadOriginal}
                className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-white/50 transition-colors"
                title="הורדת מסמך מקור"
              >
                <Download className="h-6 w-6 text-[#19183B]" />
                <span className="text-xs text-[#19183B]">הורדת מסמך מקור</span>
              </button>

              <button
                onClick={onDownloadOriginal}
                className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-white/50 transition-colors"
                title="הורדת העתק נאמן למקור"
              >
                <FileText className="h-6 w-6 text-[#19183B]" />
                <span className="text-xs text-[#19183B]">הורדת העתק נאמן למקור</span>
              </button>

              {/* Row 2 */}
              <button
                disabled
                className="flex flex-col items-center gap-2 p-4 rounded-lg opacity-50 cursor-not-allowed"
                title="שיתוף ב-Telegram (בקרוב)"
              >
                <Send className="h-6 w-6 text-[#19183B]" />
                <span className="text-xs text-[#19183B]">שיתוף ב-Telegram</span>
              </button>

              <button
                onClick={handleWhatsAppShare}
                className="flex flex-col items-center gap-2 p-4 rounded-lg transition-colors"
                style={{ backgroundColor: "#E8F5E9" }}
                title="שיתוף ב-WhatsApp"
              >
                <MessageCircle className="h-6 w-6 text-[#25D366]" />
                <span className="text-xs text-[#19183B] font-medium">שיתוף ב-WhatsApp</span>
              </button>

              <button
                disabled
                className="flex flex-col items-center gap-2 p-4 rounded-lg opacity-50 cursor-not-allowed"
                title="העלאה ל-Google Drive (בקרוב)"
              >
                <Upload className="h-6 w-6 text-[#19183B]" />
                <span className="text-xs text-[#19183B]">העלאה ל-Google Drive</span>
                <span className="text-[10px] text-[#708993]">למנויי Best ומעלה</span>
              </button>
            </div>
          </div>

          {/* Info Message */}
          <div id="success-modal-description" className="mb-6 p-4 rounded-lg" style={{ backgroundColor: "#DBEAFE", border: "1px solid #93C5FD" }}>
            <p className="text-sm text-blue-900 leading-relaxed">
              המסמך הופק ובעוד מספר רגעים אפשרי לצפות בו. אם עברת לעמוד המסמכים והוא עדיין לא שם – כדאי לרפרש את הדפדפן.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              variant="primary"
              onClick={onViewDocument}
              className="flex-1"
            >
              צפייה במסמך
            </Button>
            <Button
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              סגירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
