"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  updateBusinessDetailsAction, 
  uploadLogoAction, 
  deleteLogoAction,
  uploadSignatureAction,
  deleteSignatureAction,
  type BusinessDetailsPayload 
} from "./actions";

type Company = {
  id: string;
  company_name: string;
  business_type: string | null;
  company_number: string | null;
  industry: string | null;
  custom_industry: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  registration_number: string | null;
  address: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string;
  website: string | null;
  logo_url: string | null;
  signature_url: string | null;
};

type Props = {
  company: Company;
};

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: 'חברה בע"מ' },
  { value: "partnership", label: "שותפות" },
  { value: "other", label: "אחר" },
];

const INDUSTRIES = [
  { value: "retail", label: "קמעונאות" },
  { value: "services", label: "שירותים" },
  { value: "tech", label: "הייטק" },
  { value: "construction", label: "בנייה" },
  { value: "food", label: "מזון ומסעדנות" },
  { value: "health", label: "בריאות" },
  { value: "alternative_medicine", label: "רפואה אלטרנטיבית" },
  { value: "education", label: "חינוך" },
  { value: "other", label: "אחר" },
];

export default function SettingsClient({ company }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    company_name: company.company_name || "",
    business_type: (company.business_type as any) || "osek_patur",
    company_number: company.company_number || "",
    industry: company.industry || "",
    custom_industry: company.custom_industry || "",
    street: company.street || "",
    city: company.city || "",
    postal_code: company.postal_code || "",
    address: "", // Auto-generated from street + city, not displayed in UI
    phone: company.phone || "",
    mobile_phone: company.mobile_phone || "",
    email: company.email || "",
    website: company.website || "",
  });

  const [logoUrl, setLogoUrl] = useState(company.logo_url);
  const [signatureUrl, setSignatureUrl] = useState(company.signature_url ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveDetails = async () => {
    setIsSaving(true);
    setMessage(null);

    // Validation
    if (!formData.company_name.trim()) {
      setMessage({ type: "error", text: "שם העסק הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    if (!formData.email.trim() || !formData.email.includes("@")) {
      setMessage({ type: "error", text: "נא להזין כתובת אימייל תקינה" });
      setIsSaving(false);
      return;
    }

    if (!formData.industry) {
      setMessage({ type: "error", text: "תחום פעילות הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    if (formData.industry === "other" && !formData.custom_industry.trim()) {
      setMessage({ type: "error", text: "נא לפרט את תחום הפעילות כאשר בוחרים 'אחר'" });
      setIsSaving(false);
      return;
    }

    if (!formData.street.trim()) {
      setMessage({ type: "error", text: "רחוב ומספר הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    if (!formData.city.trim()) {
      setMessage({ type: "error", text: "עיר הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    // Auto-generate address from street and city
    const autoAddress = `${formData.street}, ${formData.city}${formData.postal_code ? ' ' + formData.postal_code : ''}`;
    
    const payload = {
      ...formData,
      address: autoAddress, // Auto-generated full address
    };

    const result = await updateBusinessDetailsAction(payload as BusinessDetailsPayload);

    if (result.ok) {
      setMessage({ type: "success", text: "הפרטים נשמרו בהצלחה!" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה בשמירה" });
    }

    setIsSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("logo", file);

    const result = await uploadLogoAction(formData);

    if (result.ok && result.logoUrl) {
      setLogoUrl(result.logoUrl);
      setMessage({ type: "success", text: "הלוגו הועלה בהצלחה!" });
      router.refresh();
    } else {
      // Check if it's a bucket not found error
      if (result.message?.includes("Bucket not found") || result.message?.includes("business-assets")) {
        setMessage({ 
          type: "error", 
          text: "❌ Storage bucket לא נמצא! יש ליצור bucket בשם 'business-assets' ב-Supabase Dashboard. ראה את הקובץ STORAGE_SETUP_GUIDE.md להוראות מפורטות." 
        });
      } else {
        setMessage({ type: "error", text: result.message || "שגיאה בהעלאת לוגו" });
      }
    }

    setIsUploadingLogo(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את הלוגו?")) return;

    setIsUploadingLogo(true);
    setMessage(null);

    const result = await deleteLogoAction();

    if (result.ok) {
      setLogoUrl(null);
      setMessage({ type: "success", text: "הלוגו נמחק בהצלחה" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה במחיקת לוגו" });
    }

    setIsUploadingLogo(false);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSignature(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("signature", file);

    const result = await uploadSignatureAction(formData);

    if (result.ok && result.signatureUrl) {
      setSignatureUrl(result.signatureUrl);
      setMessage({ type: "success", text: "החתימה הועלתה בהצלחה!" });
      router.refresh();
    } else {
      if (result.message?.includes("Bucket not found") || result.message?.includes("business-assets")) {
        setMessage({ 
          type: "error", 
          text: "❌ Storage bucket לא נמצא! יש ליצור bucket בשם 'business-assets' ב-Supabase Dashboard. ראה את הקובץ STORAGE_SETUP_GUIDE.md להוראות מפורטות." 
        });
      } else {
        setMessage({ type: "error", text: result.message || "שגיאה בהעלאת חתימה" });
      }
    }

    setIsUploadingSignature(false);
    if (signatureInputRef.current) {
      signatureInputRef.current.value = "";
    }
  };

  const handleDeleteSignature = async () => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את החתימה?")) return;

    setIsUploadingSignature(true);
    setMessage(null);

    const result = await deleteSignatureAction();

    if (result.ok) {
      setSignatureUrl(null);
      setMessage({ type: "success", text: "החתימה נמחקה בהצלחה" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה במחיקת חתימה" });
    }

    setIsUploadingSignature(false);
  };

  return (
    <div dir="rtl" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>הגדרות</h1>
        <p style={{ marginTop: 8, opacity: 0.75 }}>ניהול פרטי העסק והלוגו</p>
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

      {/* Logo Section */}
      <div
        style={{
          padding: 24,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>לוגו העסק</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Logo Preview */}
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                maxWidth: 400,
                width: "100%",
                minHeight: 200,
                border: "2px dashed #d1d5db",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f9fafb",
                padding: 20,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company Logo"
                  style={{ 
                    maxWidth: "100%", 
                    maxHeight: "400px", 
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block"
                  }}
                />
              ) : (
                <div style={{ textAlign: "center", opacity: 0.5 }}>
                  <div style={{ fontSize: 48 }}>🏢</div>
                  <div style={{ fontSize: 14, marginTop: 8 }}>אין לוגו</div>
                </div>
              )}
            </div>
          </div>

          {/* Logo Actions */}
          <div style={{ maxWidth: 600 }}>
            <p style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>
              העלה לוגו לעסק שלך. הלוגו יופיע על כל הקבלות והמסמכים.
            </p>
            <p style={{ marginBottom: 16, fontSize: 13, opacity: 0.6 }}>
              פורמטים נתמכים: PNG, JPG, SVG. גודל מקסימלי: 5MB
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleLogoUpload}
              style={{ display: "none" }}
            />

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  cursor: isUploadingLogo ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  opacity: isUploadingLogo ? 0.5 : 1,
                }}
              >
                {isUploadingLogo ? "מעלה..." : logoUrl ? "החלף לוגו" : "העלה לוגו"}
              </button>

              {logoUrl && (
                <button
                  onClick={handleDeleteLogo}
                  disabled={isUploadingLogo}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "1px solid #ef4444",
                    background: "white",
                    color: "#ef4444",
                    cursor: isUploadingLogo ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    opacity: isUploadingLogo ? 0.5 : 1,
                  }}
                >
                  מחק לוגו
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Signature Section */}
      <div
        style={{
          padding: 24,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>חתימת העסק</h2>

        {/* Show installation notice if signature_url field doesn't exist in company object */}
        {!('signature_url' in company) && (
          <div
            style={{
              padding: 16,
              marginBottom: 16,
              borderRadius: 12,
              border: "1px solid #fbbf24",
              background: "#fef3c7",
              color: "#92400e",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              📋 נדרשת התקנה
            </div>
            <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
              כדי להשתמש בתכונת החתימה, יש להריץ את הסקריפט SQL הבא במסד הנתונים:
            </div>
            <code
              style={{
                display: "block",
                padding: 12,
                background: "#fff",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "monospace",
                marginBottom: 12,
                border: "1px solid #fde68a",
              }}
            >
              scripts/016-add-signature-field.sql
            </code>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              ראה את הקובץ <strong>SIGNATURE_INSTALLATION_GUIDE.md</strong> להוראות מפורטות.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Signature Preview */}
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                maxWidth: 400,
                width: "100%",
                minHeight: 200,
                border: "2px dashed #d1d5db",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f9fafb",
                padding: 20,
              }}
            >
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="Business Signature"
                  style={{ 
                    maxWidth: "100%", 
                    maxHeight: "400px", 
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block"
                  }}
                />
              ) : (
                <div style={{ textAlign: "center", opacity: 0.5 }}>
                  <div style={{ fontSize: 48 }}>✍️</div>
                  <div style={{ fontSize: 14, marginTop: 8 }}>אין חתימה</div>
                </div>
              )}
            </div>
          </div>

          {/* Signature Actions */}
          <div style={{ maxWidth: 600 }}>
            <p style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>
              העלה חתימה דיגיטלית שתופיע על המסמכים שלך (קבלות, חשבוניות וכו').
            </p>
            <p style={{ marginBottom: 16, fontSize: 13, opacity: 0.6 }}>
              פורמטים נתמכים: PNG, JPG, SVG. גודל מקסימלי: 5MB. מומלץ רקע שקוף (PNG).
            </p>

            <input
              ref={signatureInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleSignatureUpload}
              style={{ display: "none" }}
            />

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => signatureInputRef.current?.click()}
                disabled={isUploadingSignature}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  cursor: isUploadingSignature ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  opacity: isUploadingSignature ? 0.5 : 1,
                }}
              >
                {isUploadingSignature ? "מעלה..." : signatureUrl ? "החלף חתימה" : "העלה חתימה"}
              </button>

              {signatureUrl && (
                <button
                  onClick={handleDeleteSignature}
                  disabled={isUploadingSignature}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "1px solid #ef4444",
                    background: "white",
                    color: "#ef4444",
                    cursor: isUploadingSignature ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    opacity: isUploadingSignature ? 0.5 : 1,
                  }}
                >
                  מחק חתימה
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Business Details Section */}
      <div
        style={{
          padding: 24,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>פרטי העסק</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {/* Company Name */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              שם העסק <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleInputChange}
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* Business Type - READ ONLY */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              סוג עסק <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              name="business_type"
              value={formData.business_type}
              onChange={handleInputChange}
              disabled
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                background: "#f3f4f6",
                cursor: "not-allowed",
                opacity: 0.7,
              }}
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Company Number - READ ONLY */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              מספר חברה / תעודת זהות <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="company_number"
              value={formData.company_number}
              onChange={handleInputChange}
              disabled
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                background: "#f3f4f6",
                cursor: "not-allowed",
                opacity: 0.7,
              }}
            />
          </div>

          {/* Industry */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              תחום פעילות <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            >
              <option value="">בחר תחום</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind.value} value={ind.value}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Industry - shows if "other" selected */}
          {formData.industry === "other" && (
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                פרט תחום פעילות <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                name="custom_industry"
                value={formData.custom_industry}
                onChange={handleInputChange}
                required
                placeholder="הזן את תחום הפעילות שלך"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
            </div>
          )}

          {/* Street */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              רחוב ומספר <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="street"
              value={formData.street}
              onChange={handleInputChange}
              required
              placeholder="רחוב הרצל 1"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* City */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              עיר <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              required
              placeholder="תל אביב-יפו"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* Postal Code */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מיקוד</label>
            <input
              type="text"
              name="postal_code"
              value={formData.postal_code}
              onChange={handleInputChange}
              placeholder="1234567"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* Registration Number - Shows company_number from registration, READ ONLY */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              מספר רישום (ת.ז / ח"פ) <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="company_number"
              value={formData.company_number}
              disabled
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                background: "#f3f4f6",
                cursor: "not-allowed",
                opacity: 0.7,
              }}
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              אימייל <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              style={{
                width: "100%",
                padding: 10,
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
              name="mobile_phone"
              value={formData.mobile_phone}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: 10,
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
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* Website */}
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>אתר אינטרנט</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              placeholder="https://example.com"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={handleSaveDetails}
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
            {isSaving ? "שומר..." : "שמור שינויים"}
          </button>
        </div>
      </div>
    </div>
  );
}
