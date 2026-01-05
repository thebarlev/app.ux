"use client";

import { useState, FormEvent } from "react";
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

export default function QuickAddCustomerModal({
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
  useState(() => {
    if (prefillName && !formData.name) {
      setFormData((prev) => ({ ...prev, name: prefillName }));
    }
  });

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
      className="bg-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      {/* Modal Content */}
      <div
        dir="rtl"
        className="bg-card"
        style={{
          borderRadius: 16,
          maxWidth: 500,
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div
          className="border-border text-muted-fg"
          style={{
            padding: "20px 24px",
            borderBottomWidth: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
              הוספת לקוח חדש
            </h2>
            <p style={{ fontSize: 14, opacity: 0.6, margin: "4px 0 0 0" }}>
              מילוי מהיר של פרטים בסיסיים
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-fg hover:text-fg"
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div
          className="bg-primary/10 border-primary/30 text-primary-fg"
          style={{
            padding: 12,
            borderBottomWidth: 1,
            fontSize: 13,
          }}
        >
          ℹ️ מדובר בפרטים ראשוניים בלבד. את שאר הפרטים ניתן לעדכן בהמשך בכרטיס
          הלקוח.
        </div>

        {/* Form */}
        <form
          onSubmit={handleAddToCustomers}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Global Error */}
          {errors.submit && (
            <div
              className="bg-danger/10 border-danger text-danger-fg"
              style={{
                padding: 12,
                borderWidth: 1,
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              {errors.submit}
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
                fontSize: 14,
              }}
            >
              שם הלקוח <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              autoFocus
              placeholder="שם מלא או שם עסק"
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: errors.name ? "var(--danger)" : undefined,
                fontSize: 14,
              }}
            />
            {errors.name && (
              <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>
                {errors.name}
              </div>
            )}
          </div>

          {/* Tax ID */}
          <div>
            <label
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
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
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: errors.tax_id ? "var(--danger)" : undefined,
                fontSize: 14,
              }}
            />
            {errors.tax_id ? (
              <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>
                {errors.tax_id}
              </div>
            ) : (
              <div className="text-muted-fg" style={{ fontSize: 12, marginTop: 4 }}>
                מאפשר קבלת מספר הקצאה עבור מסמכי הלקוח
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
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
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: errors.phone ? "var(--danger)" : undefined,
                fontSize: 14,
              }}
            />
            {errors.phone && (
              <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>
                {errors.phone}
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
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
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: errors.email ? "var(--danger)" : undefined,
                fontSize: 14,
              }}
            />
            {errors.email && (
              <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>
                {errors.email}
              </div>
            )}
          </div>

          {/* Country */}
          <div>
            <label
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
                fontSize: 14,
              }}
            >
              מדינה <span className="text-danger">*</span>
            </label>
            <select
              name="address_country"
              value={formData.address_country}
              onChange={handleInputChange}
              required
              className="text-fg border-border bg-card"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
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
              className="text-fg"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: 6,
                fontSize: 14,
              }}
            >
              תנאי תשלום
            </label>
            <select
              name="payment_terms_text"
              value={formData.payment_terms_text}
              onChange={handleInputChange}
              className="text-fg border-border bg-card"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
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

        {/* Footer Actions */}
        <div
          className="border-border"
          style={{
            padding: "16px 24px",
            borderTopWidth: 1,
            display: "flex",
            gap: 12,
            flexDirection: "column",
          }}
        >
          {/* Primary Action */}
          <button
            onClick={handleAddToCustomers}
            disabled={isSaving}
            className="bg-fg text-bg hover:bg-fg/90"
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? "שומר..." : "💾 הוספה ללקוחות שמורים"}
          </button>

          {/* Secondary Action */}
          <button
            type="button"
            onClick={handleSaveNameOnly}
            disabled={isSaving}
            className="bg-card text-fg border-border hover:bg-muted"
            style={{
              padding: "12px 20px",
              borderWidth: 1,
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 15,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            📝 שמירה למסמך זה בלבד
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="text-muted-fg hover:text-fg"
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
