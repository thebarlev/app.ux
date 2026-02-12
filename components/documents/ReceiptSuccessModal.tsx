"use client";

import { X, CheckCircle2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import type React from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  documentNumber: string;
  companyName: string;
  documentId: string;
  documentTypeLabel: string;
  onViewDocument?: () => void;
  onDownloadHebrew: (opts?: { issue?: "original" | "copy" }) => void;
  onDownloadEnglish: (opts?: { issue?: "original" | "copy" }) => void;
  baseLanguage: "he" | "en";
};

export default function ReceiptSuccessModal({
  isOpen,
  onClose,
  documentNumber,
  companyName,
  documentId,
  documentTypeLabel,
  onDownloadHebrew,
  onDownloadEnglish,
  baseLanguage,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [originalIssued, setOriginalIssued] = useState<boolean | null>(null);
  const englishCopyLabelRef = useRef<HTMLSpanElement | null>(null);

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

    // Measure EN copy label layout (wrap/overflow) to debug truncation issues in RTL screens.
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

  useEffect(() => {
    let cancelled = false;
    async function loadIssuance() {
      if (!isOpen) return;
      try {
        const res = await fetch(`/api/documents/${documentId}/issuance`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          const next = !!json?.originalIssued;
          setOriginalIssued(next);
        }
      } catch {
        // ignore
      }
    }
    loadIssuance();
    return () => {
      cancelled = true;
    };
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  type ModalAction = {
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
    title?: string;
  };

  const buildReceiptSuccessActions = (args: {
    baseLanguage: "he" | "en";
    originalIssued: boolean | null;
  }): {
    topRow: [ModalAction, ModalAction];
  } => {
    const hasDownloadedOriginal = args.originalIssued === true;

    // Always show 3 active buttons: after original is downloaded, 
    // the "original" button becomes "copy" but stays active
    const hebrewOriginal: ModalAction = {
      id: "original_he",
      label: args.baseLanguage === "he"
        ? "הורדת מסמך מקור"
        : hasDownloadedOriginal
          ? "הורדת העתק נאמן למקור"
          : "הורדת מקור בעברית",
      icon: <Download className="h-6 w-6 text-modal-fg" />,
      onClick: () => {
        if (hasDownloadedOriginal) {
          // After original was issued, this button downloads a copy
          onDownloadHebrew({ issue: "copy" });
        } else {
          // Regulatory: original is Hebrew-only
          onDownloadHebrew({ issue: "original" });
          setOriginalIssued(true);
        }
      },
      title: args.baseLanguage === "he"
        ? "הורדת מסמך מקור (עברית, פעם אחת)"
        : hasDownloadedOriginal
          ? "הורדת העתק נאמן למקור (עברית)"
          : "הורדת מסמך מקור (עברית, פעם אחת)",
      variant: "primary",
      disabled: false,
    };

    const hebrewCopy: ModalAction = {
      id: "copy_he",
      label: "הורדת העתק נאמן למקור",
      icon: <Download className="h-6 w-6 text-modal-fg" />,
      onClick: () => onDownloadHebrew({ issue: "copy" }),
      title: "הורדת העתק נאמן למקור (עברית)",
      variant: "secondary",
    };

    const englishCopy: ModalAction = {
      id: "copy_en",
      label: "הורדת העתק נאמן למקור (אנגלית)",
      icon: <FileText className="h-6 w-6 text-modal-fg" />,
      onClick: () => onDownloadEnglish({ issue: "copy" }),
      title: "הורדת העתק נאמן למקור (אנגלית)",
      variant: "secondary",
    };

    if (args.baseLanguage === "en") {
      return {
        topRow: [hebrewOriginal, englishCopy],
      };
    }

    return {
      topRow: [hebrewOriginal, hebrewCopy],
    };
  };

  const actions = buildReceiptSuccessActions({ baseLanguage, originalIssued });

  useEffect(() => {
    if (!isOpen) return;
  }, [isOpen, baseLanguage, originalIssued, actions.topRow]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="w-full max-w-[500px] max-h-[90vh] overflow-y-auto bg-modal rounded-[20px] shadow-xl relative text-modal-fg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
        aria-describedby="success-modal-description"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 left-4 z-10 p-2 rounded-full hover:bg-black/10 transition-colors"
          aria-label="סגירה"
        >
          <X className="h-5 w-5 text-modal-fg" />
        </button>

        {/* Modal Content */}
        <div className="p-8 text-center">
          {/* Success Icon */}
          <div className="flex items-center justify-center mb-6">
            <CheckCircle2 className="h-20 w-20 text-primary" />
          </div>

          {/* Company Name */}
          <h2
            id="success-modal-title"
            className="text-2xl font-bold text-modal-fg mb-2"
          >
            {companyName}
          </h2>

          {/* Success Title */}
          <h3 className="text-lg font-semibold text-modal-fg mb-2">
            המסמך נוצר בהצלחה
          </h3>

          {/* Receipt Number */}
          <p className="text-base text-modal-fg mb-4">
            {documentTypeLabel} #{documentNumber}
          </p>

          {/* Actions Grid */}
          <div className="mt-8 mb-6">
            {/* Top actions (regulatory + UX) */}
            <div className="grid grid-cols-2 gap-4">
              {actions.topRow.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (a.disabled) return;
                    a.onClick();
                  }}
                  disabled={a.disabled}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-colors min-w-0 ${
                    a.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/50"
                  }`}
                  title={a.title}
                >
                  {a.icon}
                  <span
                    ref={a.id === "copy_en" ? englishCopyLabelRef : undefined}
                    className="text-xs text-modal-fg w-full min-w-0 whitespace-normal break-words leading-snug text-center min-h-[32px] flex items-center justify-center"
                  >
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="secondary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
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
