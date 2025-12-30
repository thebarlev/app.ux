"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, createCustomerAction, updateCustomerAction } from "./actions";

type Props = {
  customer?: Customer;
};

const PAYMENT_TERMS_OPTIONS = [
  { value: "מיידי", label: "מיידי" },
  { value: "שוטף", label: "שוטף" },
  { value: "שוטף+10", label: "שוטף + 10" },
  { value: "שוטף+15", label: "שוטף + 15" },
  { value: "שוטף+30", label: "שוטף + 30" },
  { value: "שוטף+45", label: "שוטף + 45" },
  { value: "שוטף+60", label: "שוטף + 60" },
  { value: "שוטף+75", label: "שוטף + 75" },
  { value: "שוטף+90", label: "שוטף + 90" },
  { value: "שוטף+120", label: "שוטף + 120" },
];

export default function CustomerFormClient({ customer }: Props) {
  const router = useRouter();
  const isEdit = !!customer;

  const [formData, setFormData] = useState({
    name: customer?.name || "",
    tax_id: customer?.tax_id || "",
    profession: customer?.profession || "",
    contact_person: customer?.contact_person || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    phone_secondary: customer?.phone_secondary || "",
    mobile: customer?.mobile || "",
    address_street: customer?.address_street || "",
    address_number: customer?.address_number || "",
    address_city: customer?.address_city || "",
    address_zip: customer?.address_zip || "",
    address_country: customer?.address_country || "ישראל",
    payment_terms_text: customer?.payment_terms_text || "",
    external_account_key: customer?.external_account_key || "",
    bank_name: customer?.bank_name || "",
    bank_branch: customer?.bank_branch || "",
    bank_account: customer?.bank_account || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // Validation
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "שם העסק / לקוח הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    const payload = {
      name: formData.name,
      tax_id: formData.tax_id || undefined,
      profession: formData.profession || undefined,
      contact_person: formData.contact_person || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      phone_secondary: formData.phone_secondary || undefined,
      mobile: formData.mobile || undefined,
      address_street: formData.address_street || undefined,
      address_number: formData.address_number || undefined,
      address_city: formData.address_city || undefined,
      address_zip: formData.address_zip || undefined,
      address_country: formData.address_country || undefined,
      payment_terms_text: formData.payment_terms_text || undefined,
      external_account_key: formData.external_account_key || undefined,
      bank_name: formData.bank_name || undefined,
      bank_branch: formData.bank_branch || undefined,
      bank_account: formData.bank_account || undefined,
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
              פרטי הלקוח
            </h1>
            <p style={{ marginTop: 8, opacity: 0.75 }}>
              {isEdit ? "עדכן את פרטי הלקוח" : "הוסף לקוח חדש למערכת"}
            </p>
          </div>
          {isEdit && (
            <Link
              href={`/dashboard/customers/${customer.id}/documents`}
              style={{
                padding: "10px 20px",
                background: "#3b82f6",
                color: "white",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                display: "inline-block",
              }}
            >
              📄 צפה במסמכים
            </Link>
          )}
        </div>
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
                שם העסק / לקוח <span style={{ color: "#ef4444" }}>*</span>
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

            {/* Tax ID */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                מספר עוסק (ת.ז / ח.פ)
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
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Profession */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                עיסוק ומקצוע
              </label>
              <input
                type="text"
                name="profession"
                value={formData.profession}
                onChange={handleInputChange}
                placeholder="לדוגמה: עורך דין, רופא, יועץ עסקי"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Section Separator */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "2px solid #e5e7eb" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 16 }}>
                פרטי התקשרות
              </h3>
            </div>

            {/* Contact Person */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>איש קשר</label>
              <input
                type="text"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleInputChange}
                placeholder="שם איש הקשר"
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

            {/* Phone Secondary */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                טלפון נוסף
              </label>
              <input
                type="tel"
                name="phone_secondary"
                value={formData.phone_secondary}
                onChange={handleInputChange}
                placeholder="04-7654321"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Mobile */}
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

            {/* Section Separator */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "2px solid #e5e7eb" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 16 }}>כתובת</h3>
            </div>

            {/* Address Street & Number Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>רחוב</label>
                <input
                  type="text"
                  name="address_street"
                  value={formData.address_street}
                  onChange={handleInputChange}
                  placeholder="שם הרחוב"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מספר</label>
                <input
                  type="text"
                  name="address_number"
                  value={formData.address_number}
                  onChange={handleInputChange}
                  placeholder="123"
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

            {/* City & Zip Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>ישוב</label>
                <input
                  type="text"
                  name="address_city"
                  value={formData.address_city}
                  onChange={handleInputChange}
                  placeholder="תל אביב"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מיקוד</label>
                <input
                  type="text"
                  name="address_zip"
                  value={formData.address_zip}
                  onChange={handleInputChange}
                  placeholder="1234567"
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

            {/* Country */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מדינה</label>
              <input
                type="text"
                name="address_country"
                value={formData.address_country}
                onChange={handleInputChange}
                placeholder="ישראל"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Section Separator */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "2px solid #e5e7eb" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 16 }}>
                פרטים חשבונאיים
              </h3>
            </div>

            {/* Payment Terms */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
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
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  background: "white",
                }}
              >
                <option value="">בחר תנאי תשלום</option>
                {PAYMENT_TERMS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* External Account Key */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                מפתח לקוח
              </label>
              <input
                type="text"
                name="external_account_key"
                value={formData.external_account_key}
                onChange={handleInputChange}
                placeholder="מפתח חשבון בתוכנה חיצונית (חשבשבת וכו')"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Section Separator */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "2px solid #e5e7eb" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 8 }}>
                פרטי חשבון בנק
              </h3>
              <p style={{ fontSize: 13, opacity: 0.6, margin: 0, marginBottom: 16 }}>
                פרטי החשבון יוצגו אוטומטית בקבלות
              </p>
            </div>

            {/* Bank Name */}
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>שם הבנק</label>
              <input
                type="text"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleInputChange}
                placeholder="לדוגמה: בנק הפועלים"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Bank Branch & Account Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                  מספר סניף
                </label>
                <input
                  type="text"
                  name="bank_branch"
                  value={formData.bank_branch}
                  onChange={handleInputChange}
                  placeholder="123"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                  מספר חשבון
                </label>
                <input
                  type="text"
                  name="bank_account"
                  value={formData.bank_account}
                  onChange={handleInputChange}
                  placeholder="1234567"
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
