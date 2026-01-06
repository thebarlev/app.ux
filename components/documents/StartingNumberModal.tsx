"use client";

import { useState, useEffect, useRef } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";
import { AlertCircle, Hash, Loader2, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelperText } from "@/components/ui/helper-text";
import { FieldWrapper } from "@/components/ui/field-wrapper";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
      role="presentation"
      dir="rtl"
    >
      <Card 
        className="w-full max-w-2xl shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-ui bg-primary/10 flex-shrink-0">
                <Hash className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle id="modal-title" className="text-2xl mb-2">
                  בחירת מספר מסמך ראשון
                </CardTitle>
                <CardDescription id="modal-description" className="text-sm leading-relaxed">
                  זוהי פעולה חד-פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
                </CardDescription>
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
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Warning Alert */}
          <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/20 rounded-ui" role="alert">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-card-fg">
              <strong className="font-semibold">חשוב:</strong> לא ניתן לבחור 0. ברירת המחדל היא 1. המיספור ימשיך בצורה רציפה (1, 2, 3...).
            </div>
          </div>

          {/* Error announcement */}
          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-ui" role="alert" aria-live="assertive">
              <HelperText error className="mb-0">
                {error}
              </HelperText>
            </div>
          )}

          {/* Quick Options */}
          <div className="space-y-3">
            <Label>בחירה מהירה</Label>
            <div className="grid grid-cols-3 gap-3" role="group" aria-label="אפשרויות מספר התחלתי">
              {quickOptions.map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={startingNumber === num ? "default" : "secondary"}
                  onClick={() => {
                    setStartingNumber(num);
                    setError(null);
                  }}
                  disabled={loading}
                  aria-pressed={startingNumber === num}
                  aria-label={`בחר מספר ${num}`}
                  className="h-[50px]"
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
          <div className="p-4 bg-muted/50 border border-border rounded-ui" aria-live="polite">
            <div className="text-sm font-semibold text-muted-fg mb-2">
              תצוגה מקדימה של המיספור:
            </div>
            <div className="text-lg font-bold text-card-fg">
              {startingNumber}, {startingNumber + 1}, {startingNumber + 2}...
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3 pt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            aria-label="ביטול ללא שמירה"
            className="flex-1"
          >
            ביטול
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={loading || startingNumber < 1}
            isLoading={loading}
            aria-busy={loading}
            aria-label={loading ? "שומר מספר התחלתי" : "אישור והתחלת מיספור"}
            className="flex-1"
          >
            {loading ? "שומר..." : "אישור והתחלת מיספור"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
