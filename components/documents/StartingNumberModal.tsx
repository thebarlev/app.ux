"use client";

import { useState, useEffect, useRef } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";
import { AlertCircle, Hash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelperText } from "@/components/ui/helper-text";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { FormSection } from "@/components/ui/form-section";

type Props = {
  documentType: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function StartingNumberModal({
  documentType,
  onClose,
  onSuccess,
}: Props) {
  const [startingNumber, setStartingNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const quickOptions = [1, 100, 1000];

  // Focus trap and escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    // Focus the modal when it opens
    closeButtonRef.current?.focus();

    document.addEventListener('keydown', handleEscape);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [loading, onClose]);

  async function onConfirm() {
    if (startingNumber < 1) {
      setError("מספר התחלתי חייב להיות 1 לפחות");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await lockStartingNumberAction({
        documentType,
        startingNumber,
        prefix: null,
      });

      if (!res.ok) {
        // If already locked, treat as success
        if (res.message?.includes("sequence_already_locked")) {
          onSuccess();
          return;
        }

        setError(res.message || "אירעה שגיאה. נסה שוב.");
        return;
      }

      // Success
      onSuccess();
    } catch (e) {
      setError("אירעה שגיאה. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          // Backdrop clicks are ignored to avoid accidental immediate-close
          // from click carry-over during route transitions.
        }
      }}
      role="presentation"
      dir="rtl"
    >
      <div 
        className="w-full max-w-[600px] bg-modal rounded-[5px] shadow-xl text-modal-fg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-[30px] pb-0">
          <div className="flex items-start gap-4 flex-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-[5px] bg-primary/10 flex-shrink-0">
              <Hash className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="modal-title" className="mb-2">
                בחירת מספר מסמך ראשון
              </h2>
              <p id="modal-description" className="leading-relaxed">
                זוהי פעולה חד-פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
              </p>
            </div>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={loading}
            aria-label="סגור חלון"
            className="flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-[30px] space-y-[50px]">
          {/* Warning Alert */}
        

          {/* Error announcement */}
          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-[5px]" role="alert" aria-live="assertive">
              <HelperText error className="mb-0">
                {error}
              </HelperText>
            </div>
          )}

          {/* Quick Options */}
          <div className="space-y-[25px]">
            <Label>בחירה מהירה</Label>
            <div className="ui-form-grid" role="group" aria-label="אפשרויות מספר התחלתי">
              {quickOptions.map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={startingNumber === num ? "primary" : "secondary"}
                  onClick={() => {
                    setStartingNumber(num);
                    setError(null);
                  }}
                  disabled={loading}
                  aria-pressed={startingNumber === num}
                  aria-label={`בחר מספר ${num}`}
                >
                  {num}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <FieldWrapper 
            label="או הזן מספר מותאם אישית"
            required
            error={error}
            id="customNumber"
          >
            <Input
              id="customNumber"
              type="number"
              min={1}
              required
              value={startingNumber}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  setStartingNumber(val);
                  setError(null);
                }
              }}
              disabled={loading}
              aria-required="true"
              aria-invalid={!!error}
            />
          </FieldWrapper>

          {/* Preview */}
          
        </div>

        {/* Footer Actions */}
        <div className="p-[30px] pt-0">
          <div className="flex gap-3 justify-start">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              aria-label="ביטול ללא שמירה"
            >
              ביטול
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              disabled={loading || startingNumber < 1}
              loading={loading}
              aria-busy={loading}
              aria-label={loading ? "שומר מספר התחלתי" : "אישור והתחלת מיספור"}
            >
              {loading ? "שומר..." : "אישור והתחלת מיספור"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
