"use client";

import { useState, FormEvent, useEffect } from "react";
import { createCustomerAction } from "@/app/dashboard/customers/actions";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: { id: string; name: string }) => void;
  onSaveNameOnly: (name: string) => void;
  prefillName?: string;
};

const COUNTRIES = ["ישראל", "ארצות הברית", "בריטניה", "גרמניה", "צרפת", "אחר"];

const PAYMENT_TERMS = [
  { value: "שוטף", label: "שוטף" },
  { value: "מיידי", label: "מיידי" },
  { value: "שוטף+10", label: "שוטף + 10" },
  { value: "שוטף+15", label: "שוטף + 15" },
  { value: "שוטף+30", label: "שוטף + 30" },
  { value: "שוטף+45", label: "שוטף + 45" },
  { value: "שוטף+60", label: "שוטף + 60" },
];

export default function QuickAddCustomerDrawer({
  isOpen,
  onClose,
  onCustomerCreated,
  onSaveNameOnly,
  prefillName = "",
}: Props) {
  const [formData, setFormData] = useState({
    name: prefillName,
    tax_id: "",
    phone: "",
    email: "",
    address_country: "ישראל",
    payment_terms_text: "שוטף",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Update name when prefillName changes
  useEffect(() => {
    if (prefillName && !formData.name) {
      setFormData((prev) => ({ ...prev, name: prefillName }));
    }
  }, [prefillName]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "שם הלקוח הוא שדה חובה";
    }

    // Tax ID validation (Israeli ID: 9 digits or company number: 9 digits)
    if (formData.tax_id && !/^\d{9}$/.test(formData.tax_id.replace(/[-\s]/g, ""))) {
      newErrors.tax_id = "מספר זהות/ח.פ חייב להכיל 9 ספרות";
    }

    // Phone validation (Israeli format)
    if (
      formData.phone &&
      !/^0\d{1,2}-?\d{7}$/.test(formData.phone.replace(/[\s-]/g, ""))
    ) {
      newErrors.phone = "מספר טלפון לא תקין (לדוגמה: 03-1234567)";
    }

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "כתובת אימייל לא תקינה";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleAddToCustomers = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);
    const result = await createCustomerAction({
      name: formData.name,
      tax_id: formData.tax_id || undefined,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      address_country: formData.address_country || undefined,
      payment_terms_text: formData.payment_terms_text || undefined,
    });

    setIsSaving(false);

    if (result.ok && result.data) {
      onCustomerCreated({ id: result.data.id, name: result.data.name });
      handleClose();
    } else {
      setErrors({ submit: result.message || "שגיאה ביצירת לקוח" });
    }
  };

  const handleSaveNameOnly = () => {
    if (!formData.name.trim()) {
      setErrors({ name: "שם הלקוח הוא שדה חובה" });
      return;
    }
    onSaveNameOnly(formData.name);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      name: "",
      tax_id: "",
      phone: "",
      email: "",
      address_country: "ישראל",
      payment_terms_text: "שוטף",
    });
    setErrors({});
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.4)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "stretch",
      }}
    >
      {/* Drawer Content - Slides from left, full height */}
      <div
        dir="rtl"
        style={{
          background: "white",
          width: "100%",
          maxWidth: 480,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
          animation: "slideInFromLeft 0.3s ease-out",
        }}
      >
        <style jsx>{`
          @keyframes slideInFromLeft {
            from {
              transform: translateX(-100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "#f9fafb",
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
              🆕 הוספת לקוח חדש
            </h2>
            <p style={{ fontSize: 14, opacity: 0.6, margin: "6px 0 0 0" }}>
              מילוי מהיר של פרטים בסיסיים
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: "#e5e7eb",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#374151",
              lineHeight: 1,
              padding: 8,
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div
          style={{
            padding: 14,
            background: "#dbeafe",
            borderBottom: "1px solid #bfdbfe",
            fontSize: 13,
            color: "#1e40af",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span>
            מדובר בפרטים ראשוניים בלבד. את שאר הפרטים ניתן לעדכן בהמשך בכרטיס
            הלקוח.
          </span>
        </div>

        {/* Form - Scrollable */}
        <form
          onSubmit={handleAddToCustomers}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Global Error */}
          {errors.submit && (
            <div
              style={{
                padding: 12,
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#991b1b",
                fontSize: 14,
              }}
            >
              ⚠️ {errors.submit}
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              שם הלקוח <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              autoFocus
              placeholder="שם מלא או שם עסק"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${errors.name ? "#ef4444" : "#d1d5db"}`,
                fontSize: 15,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!errors.name) e.target.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                if (!errors.name) e.target.style.borderColor = "#d1d5db";
              }}
            />
            {errors.name && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
                {errors.name}
              </div>
            )}
          </div>

          {/* Tax ID */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              ת.ז / ח.פ
            </label>
            <input
              type="text"
              name="tax_id"
              value={formData.tax_id}
              onChange={handleInputChange}
              placeholder="123456789"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${errors.tax_id ? "#ef4444" : "#d1d5db"}`,
                fontSize: 15,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!errors.tax_id) e.target.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                if (!errors.tax_id) e.target.style.borderColor = "#d1d5db";
              }}
            />
            {errors.tax_id ? (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
                {errors.tax_id}
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
                💡 מאפשר קבלת מספר הקצאה עבור מסמכי הלקוח
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              טלפון
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="03-1234567"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${errors.phone ? "#ef4444" : "#d1d5db"}`,
                fontSize: 15,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!errors.phone) e.target.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                if (!errors.phone) e.target.style.borderColor = "#d1d5db";
              }}
            />
            {errors.phone && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
                {errors.phone}
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              מייל
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="example@domain.com"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${errors.email ? "#ef4444" : "#d1d5db"}`,
                fontSize: 15,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!errors.email) e.target.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                if (!errors.email) e.target.style.borderColor = "#d1d5db";
              }}
            />
            {errors.email && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
                {errors.email}
              </div>
            )}
          </div>

          {/* Country */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              מדינה <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              name="address_country"
              value={formData.address_country}
              onChange={handleInputChange}
              required
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid #d1d5db",
                fontSize: 15,
                background: "white",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Terms */}
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              תנאי תשלום
            </label>
            <select
              name="payment_terms_text"
              value={formData.payment_terms_text}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid #d1d5db",
                fontSize: 15,
                background: "white",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term.value} value={term.value}>
                  {term.label}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer Actions - Fixed */}
        <div
          style={{
            padding: "20px 24px",
            borderTop: "2px solid #e5e7eb",
            display: "flex",
            gap: 12,
            flexDirection: "column",
            background: "#f9fafb",
          }}
        >
          {/* Primary Action */}
          <button
            onClick={handleAddToCustomers}
            disabled={isSaving}
            style={{
              padding: "14px 20px",
              background: isSaving ? "#9ca3af" : "#111827",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 16,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isSaving) e.currentTarget.style.background = "#1f2937";
            }}
            onMouseLeave={(e) => {
              if (!isSaving) e.currentTarget.style.background = "#111827";
            }}
          >
            {isSaving ? "⏳ שומר..." : "💾 הוספה ללקוחות שמורים"}
          </button>

          {/* Secondary Action */}
          <button
            type="button"
            onClick={handleSaveNameOnly}
            disabled={isSaving}
            style={{
              padding: "14px 20px",
              background: "white",
              color: "#111827",
              border: "2px solid #d1d5db",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 16,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.borderColor = "#111827";
                e.currentTarget.style.background = "#f9fafb";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.background = "white";
              }
            }}
          >
            📝 שמירה למסמך זה בלבד
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            style={{
              padding: "12px 20px",
              background: "transparent",
              color: "#6b7280",
              border: "none",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 15,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isSaving) e.currentTarget.style.color = "#374151";
            }}
            onMouseLeave={(e) => {
              if (!isSaving) e.currentTarget.style.color = "#6b7280";
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
