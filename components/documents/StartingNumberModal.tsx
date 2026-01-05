"use client";

import { useState, useEffect, useRef } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";
import { AlertCircle, Hash, Loader2, X } from "lucide-react";

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
      className="ui-modal-overlay" 
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
      role="presentation"
    >
      <div 
        className="ui-modal" 
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        <div className="ui-modal-header">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-ui-lg bg-gradient-to-br from-ui-primary to-ui-primary-hover shadow-ui" aria-hidden="true">
              <Hash className="h-5 w-5 text-primary-fg" />
            </div>
            <div className="flex-1">
              <h2 id="modal-title" className="text-xl font-bold text-ui-text">בחירת מספר מסמך ראשון</h2>
              <p id="modal-description" className="ui-text-muted text-sm mt-1">
                זוהי פעולה חד-פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="סגור חלון"
            className="p-2 -mt-2 -mr-2 rounded-md hover:bg-ui-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="h-5 w-5 text-ui-text-muted" />
          </button>
        </div>

        <div className="ui-alert-warning mb-0" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <strong className="font-semibold">חשוב:</strong> לא ניתן לבחור 0. ברירת המחדל היא 1. המיספור ימשיך בצורה רציפה (1, 2, 3...).
            </div>
          </div>
        </div>

        <div className="ui-modal-body space-y-5">
          {/* Error announcement */}
          {error && (
            <div className="ui-alert-danger" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {/* Quick Options */}
          <div>
            <label className="ui-label">בחירה מהירה</label>
            <div className="grid grid-cols-3 gap-3" role="group" aria-label="אפשרויות מספר התחלתי">
              {quickOptions.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setStartingNumber(num);
                    setError(null);
                  }}
                  disabled={loading}
                  aria-pressed={startingNumber === num}
                  aria-label={`בחר מספר ${num}`}
                  className={startingNumber === num ? "ui-button-primary" : "ui-button-secondary"}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <div>
            <label htmlFor="customNumber" className="ui-label">
              או הזן מספר מותאם אישית <span className="text-ui-danger" aria-label="שדה חובה">*</span>
            </label>
            <input
              id="customNumber"
              type="number"
              min={1}
              required
              aria-required="true"
              aria-invalid={!!error}
              aria-describedby={error ? "number-error" : "number-preview"}
              value={startingNumber}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  setStartingNumber(val);
                  setError(null);
                }
              }}
              disabled={loading}
              className={error ? "ui-input-error" : "ui-input"}
            />
            {error && <p id="number-error" className="text-sm text-ui-danger mt-1" role="alert">{error}</p>}
          </div>

          {/* Preview */}
          <div id="number-preview" className="rounded-ui bg-ui-bg border border-ui-border p-4" aria-live="polite">
            <div className="ui-text-muted text-sm font-semibold mb-2">
              תצוגה מקדימה של המיספור:
            </div>
            <div className="text-lg font-bold text-ui-text">
              {startingNumber}, {startingNumber + 1}, {startingNumber + 2}...
            </div>
          </div>
        </div>

        <div className="ui-modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="ביטול ללא שמירה"
            className="ui-button-secondary flex-1"
          >
            ביטול
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={loading || startingNumber < 1}
            aria-busy={loading}
            aria-label={loading ? "שומר מספר התחלתי" : "אישור והתחלת מיספור"}
            className="ui-button-primary flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                שומר...
              </>
            ) : (
              "אישור והתחלת מיספור"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
