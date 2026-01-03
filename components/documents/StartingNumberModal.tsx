"use client";

import { useState } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";
import { AlertCircle, Hash, Loader2 } from "lucide-react";

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

  const quickOptions = [1, 100, 1000];

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
    <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="ui-modal" dir="rtl">
        <div className="ui-modal-header">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-ui-lg bg-gradient-to-br from-ui-primary to-ui-primary-hover shadow-ui">
              <Hash className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ui-text">בחירת מספר מסמך ראשון</h2>
              <p className="ui-text-muted text-sm mt-1">
                זוהי פעולה חד-פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
              </p>
            </div>
          </div>
        </div>

        <div className="ui-alert-warning mb-0">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="font-semibold">חשוב:</strong> לא ניתן לבחור 0. ברירת המחדל היא 1. המיספור ימשיך בצורה רציפה (1, 2, 3...).
            </div>
          </div>
        </div>

        <div className="ui-modal-body space-y-5">
          {/* Quick Options */}
          <div>
            <label className="ui-label">בחירה מהירה</label>
            <div className="grid grid-cols-3 gap-3">
              {quickOptions.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setStartingNumber(num)}
                  disabled={loading}
                  className={startingNumber === num ? "ui-button-primary" : "ui-button-secondary"}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <div>
            <label htmlFor="customNumber" className="ui-label">או הזן מספר מותאם אישית</label>
            <input
              id="customNumber"
              type="number"
              min={1}
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
            {error && <p className="text-sm text-ui-danger mt-1">{error}</p>}
          </div>

          {/* Preview */}
          <div className="rounded-ui bg-ui-bg border border-ui-border p-4">
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
            className="ui-button-secondary flex-1"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || startingNumber < 1}
            className="ui-button-primary flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
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
