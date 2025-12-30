"use client";

import { useState } from "react";
import { lockStartingNumberAction } from "@/app/dashboard/documents/actions";

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        dir="rtl"
        style={{
          background: "white",
          borderRadius: 16,
          maxWidth: 500,
          width: "100%",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
            🔢 בחירת מספר מסמך ראשון
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "8px 0 0 0", lineHeight: 1.5 }}>
            זוהי פעולה חד-פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
          </p>
        </div>

        {/* Info Banner */}
        <div
          style={{
            padding: 14,
            background: "#fef3c7",
            borderBottom: "1px solid #fde68a",
            fontSize: 13,
            color: "#92400e",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>
            <strong>חשוב:</strong> לא ניתן לבחור 0. ברירת המחדל היא 1. המיספור ימשיך בצורה רציפה (1, 2, 3...).
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Quick Options */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 10,
                fontSize: 14,
              }}
            >
              בחירה מהירה:
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {quickOptions.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setStartingNumber(num)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: startingNumber === num ? "2px solid #3b82f6" : "2px solid #e5e7eb",
                    background: startingNumber === num ? "#eff6ff" : "white",
                    color: startingNumber === num ? "#1e40af" : "#374151",
                    fontWeight: startingNumber === num ? 700 : 600,
                    fontSize: 16,
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              או הזן מספר מותאם אישית:
            </label>
            <input
              type="number"
              min={1}
              value={startingNumber}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  setStartingNumber(val);
                }
              }}
              disabled={loading}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${error ? "#ef4444" : "#d1d5db"}`,
                fontSize: 16,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                if (!error) e.target.style.borderColor = "#d1d5db";
              }}
            />
            {error && (
              <div style={{ color: "#ef4444", fontSize: 13, marginTop: 6 }}>
                ⚠️ {error}
              </div>
            )}
          </div>

          {/* Preview */}
          <div
            style={{
              marginTop: 20,
              padding: 16,
              background: "#f9fafb",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
              תצוגה מקדימה של המיספור:
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
              {String(startingNumber).padStart(6, "0")}, {String(startingNumber + 1).padStart(6, "0")}, {String(startingNumber + 2).padStart(6, "0")}...
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: 12,
            background: "#f9fafb",
          }}
        >
          {/* Confirm Button */}
          <button
            onClick={onConfirm}
            disabled={loading || startingNumber < 1}
            style={{
              flex: 1,
              padding: "14px 20px",
              background: loading || startingNumber < 1 ? "#9ca3af" : "#111827",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 16,
              cursor: loading || startingNumber < 1 ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "⏳ שומר..." : "✅ אישור והתחלת מיספור"}
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "14px 20px",
              background: "white",
              color: "#6b7280",
              border: "2px solid #e5e7eb",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
