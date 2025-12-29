"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, createCustomerAction, updateCustomerAction } from "./actions";

type Props = {
  customer?: Customer;
};

export default function CustomerFormClient({ customer }: Props) {
  const router = useRouter();
  const isEdit = !!customer;

  const [formData, setFormData] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    mobile: customer?.mobile || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // Validation
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "שם הלקוח הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    const payload = {
      name: formData.name,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      mobile: formData.mobile || undefined,
    };

    const result = isEdit
      ? await updateCustomerAction(customer.id, payload)
      : await createCustomerAction(payload);

    if (result.ok) {
      setMessage({ type: "success", text: isEdit ? "הלקוח עודכן בהצלחה!" : "הלקוח נוצר בהצלחה!" });
      setTimeout(() => {
        router.push("/dashboard/customers");
        router.refresh();
      }, 1000);
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה בשמירה" });
    }

    setIsSaving(false);
  };

  return (
    <div dir="rtl" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link
          href="/dashboard/customers"
          style={{
            display: "inline-block",
            marginBottom: 16,
            color: "#3b82f6",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          ← חזרה ללקוחות
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
          {isEdit ? "עריכת לקוח" : "לקוח חדש"}
        </h1>
        <p style={{ marginTop: 8, opacity: 0.75 }}>
          {isEdit ? "עדכן את פרטי הלקוח" : "הוסף לקוח חדש למערכת"}
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: 16,
            marginBottom: 24,
            borderRadius: 12,
            border: `1px solid ${message.type === "success" ? "#10b981" : "#ef4444"}`,
            background: message.type === "success" ? "#d1fae5" : "#fee2e2",
            color: message.type === "success" ? "#065f46" : "#991b1b",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            padding: 24,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
          }}
        >
          <div style={{ display: "grid", gap: 20 }}>
            {/* Name */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                שם הלקוח <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="שם מלא או שם עסק"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>אימייל</label>
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
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>טלפון</label>
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
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Mobile Phone */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>נייד</label>
              <input
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleInputChange}
                placeholder="050-1234567"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e7eb", display: "flex", gap: 12 }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: "12px 32px",
                borderRadius: 12,
                border: "1px solid #111827",
                background: "#111827",
                color: "white",
                cursor: isSaving ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 16,
                opacity: isSaving ? 0.5 : 1,
              }}
            >
              {isSaving ? "שומר..." : isEdit ? "עדכן לקוח" : "צור לקוח"}
            </button>
            <Link
              href="/dashboard/customers"
              style={{
                padding: "12px 32px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "white",
                color: "#111827",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 16,
                display: "inline-block",
                textAlign: "center",
              }}
            >
              ביטול
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
