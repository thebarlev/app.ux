"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TemplateSelector from "@/components/dashboard/TemplateSelector";
import SimpleTemplateSelector from "@/components/dashboard/SimpleTemplateSelector";
import {
  updateBusinessDetailsAction,
  uploadLogoAction,
  deleteLogoAction,
  uploadCompanySignatureAction,
  deleteSignatureAction,
  type BusinessDetailsPayload,
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

type Template = {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_default: boolean;
  company_id: string | null;
};

type Props = {
  company: Company;
  initialTemplates: Template[];
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

export default function SettingsClient({ company, initialTemplates }: Props) {
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
    const autoAddress = `${formData.street}, ${formData.city}${formData.postal_code ? " " + formData.postal_code : ""}`;

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
          text: "❌ Storage bucket לא נמצא! יש ליצור bucket בשם 'business-assets' ב-Supabase Dashboard. ראה את הקובץ STORAGE_SETUP_GUIDE.md להוראות מפורטות.",
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

    // ✅ פה היה השם הלא נכון:
    const result = await uploadCompanySignatureAction(formData);

    console.log("Signature upload result:", result);

    if (result && result.ok && result.signatureUrl) {
      setSignatureUrl(result.signatureUrl);
      setMessage({ type: "success", text: "החתימה הועלתה בהצלחה!" });
      router.refresh();
    } else {
      console.error("Signature upload failed:", result);

      // Handle undefined/null result
      if (!result) {
        setMessage({
          type: "error",
          text: "שגיאה בהעלאת חתימה - לא התקבלה תשובה מהשרת. אנא בדוק את ה-console לפרטים נוספים.",
        });
        return;
      }

      const errorMessage = result.message || "שגיאה בהעלאת חתימה";

      if (errorMessage.includes("Bucket not found") || errorMessage.includes("business-assets")) {
        setMessage({
          type: "error",
          text: "❌ Storage bucket לא נמצא! יש ליצור bucket בשם 'business-assets' ב-Supabase Dashboard. ראה את הקובץ STORAGE_SETUP_GUIDE.md להוראות מפורטות.",
        });
      } else if (errorMessage.includes("not_authenticated") || errorMessage.includes("לא מחובר")) {
        setMessage({
          type: "error",
          text: "❌ לא מחובר למערכת. אנא התחבר מחדש.",
        });
      } else if (errorMessage.includes("company_not_found") || errorMessage.includes("לא נמצאה חברה")) {
        setMessage({
          type: "error",
          text: "❌ לא נמצאה חברה קשורה למשתמש. אנא צור קשר עם התמיכה.",
        });
      } else {
        setMessage({ type: "error", text: errorMessage });
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
    <div dir="rtl" className="text-fg" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="text-fg" style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>הגדרות</h1>
        <p className="text-muted-fg" style={{ marginTop: 8 }}>ניהול פרטי העסק והלוגו</p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={message.type === "success" ? "bg-success/10 border-success text-success-fg" : "bg-danger/10 border-danger text-danger-fg"}
          style={{
            padding: 16,
            marginBottom: 24,
            borderRadius: 12,
            borderWidth: 1,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Logo & Signature Section - Combined */}
      <div
        className="bg-card text-fg border-border"
        style={{
          padding: 24,
          borderWidth: 1,
          borderRadius: 16,
          marginBottom: 24,
        }}
      >
        <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>לוגו וחתימת העסק</h2>

        {/* Show installation notice if signature_url field doesn't exist */}
        {company.signature_url === undefined && (
          <div
            className="bg-warning/10 border-warning text-warning-fg"
            style={{
              padding: 16,
              marginBottom: 16,
              borderRadius: 12,
              borderWidth: 1,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📋 נדרשת התקנה לחתימה</div>
            <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
              כדי להשתמש בתכונת החתימה, יש להריץ: <code className="bg-bg text-fg" style={{ padding: "2px 6px", borderRadius: 4 }}>scripts/016-add-signature-field.sql</code>
            </div>
          </div>
        )}

        {/* Combined Grid: Logo on Right, Signature on Left */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 24 }}>
          
          {/* Logo Section */}
          <div>
            <h3 className="text-muted-fg" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>לוגו העסק</h3>
            
            {/* Logo Preview */}
            <div
              className="border-border bg-muted"
              style={{
                width: "100%",
                minHeight: 160,
                borderWidth: 2,
                borderStyle: "dashed",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                marginBottom: 16,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company Logo"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "140px",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ textAlign: "center", opacity: 0.4 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13, color: "#9ca3af" }}>לא הועלה</div>
                </div>
              )}
            </div>

            <p style={{ marginBottom: 12, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
              הלוגו יופיע על כל הקבלות והמסמכים. פורמטים: PNG, JPG, SVG (עד 5MB)
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleLogoUpload}
              style={{ display: "none" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
                className="bg-fg text-bg border-fg hover:bg-fg/90"
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  borderWidth: 1,
                  cursor: isUploadingLogo ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  opacity: isUploadingLogo ? 0.5 : 1,
                }}
              >
                {isUploadingLogo ? "מעלה..." : logoUrl ? "החלף" : "העלה לוגו"}
              </button>

              {logoUrl && (
                <button
                  onClick={handleDeleteLogo}
                  disabled={isUploadingLogo}
                  className="bg-bg text-danger border-danger hover:bg-danger/10"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    borderWidth: 1,
                    cursor: isUploadingLogo ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                    opacity: isUploadingLogo ? 0.5 : 1,
                  }}
                >
                  מחק
                </button>
              )}
            </div>
          </div>

          {/* Signature Section */}
          <div>
            <h3 className="text-muted-fg" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>חתימת העסק</h3>
            
            {/* Signature Preview */}
            <div
              className="border-border bg-muted"
              style={{
                width: "100%",
                minHeight: 160,
                borderWidth: 2,
                borderStyle: "dashed",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                marginBottom: 16,
              }}
            >
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="Business Signature"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "140px",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ textAlign: "center", opacity: 0.4 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                  <div className="text-muted-fg" style={{ fontSize: 13 }}>לא הועלה</div>
                </div>
              )}
            </div>

            <p style={{ marginBottom: 12, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
              החתימה תופיע על המסמכים. פורמטים: PNG, JPG, SVG (עד 5MB). מומלץ רקע שקוף
            </p>

            <input
              ref={signatureInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleSignatureUpload}
              style={{ display: "none" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => signatureInputRef.current?.click()}
                disabled={isUploadingSignature}
                className="bg-fg text-bg border-fg hover:bg-fg/90"
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  borderWidth: 1,
                  cursor: isUploadingSignature ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  opacity: isUploadingSignature ? 0.5 : 1,
                }}
              >
                {isUploadingSignature ? "מעלה..." : signatureUrl ? "החלף" : "העלה חתימה"}
              </button>

              {signatureUrl && (
                <button
                  onClick={handleDeleteSignature}
                  disabled={isUploadingSignature}
                  className="bg-bg text-danger border-danger hover:bg-danger/10"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    borderWidth: 1,
                    cursor: isUploadingSignature ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                    opacity: isUploadingSignature ? 0.5 : 1,
                  }}
                >
                  מחק
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Business Details Section */}
      <div
        className="bg-card text-fg border-border"
        style={{
          padding: 24,
          borderWidth: 1,
          borderRadius: 16,
        }}
      >
        <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>פרטי העסק</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {/* Company Name */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              שם העסק <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleInputChange}
              required
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Business Type - READ ONLY */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              סוג עסק <span className="text-danger">*</span>
            </label>
            <select
              name="business_type"
              value={formData.business_type}
              onChange={handleInputChange}
              disabled
              required
              className="text-fg bg-muted border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
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
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              מספר חברה / תעודת זהות <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="company_number"
              value={formData.company_number}
              onChange={handleInputChange}
              disabled
              required
              className="text-fg bg-muted border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
                cursor: "not-allowed",
                opacity: 0.7,
              }}
            />
          </div>

          {/* Industry */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              תחום פעילות <span className="text-danger">*</span>
            </label>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
              required
              className="text-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
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
              <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                פרט תחום פעילות <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="custom_industry"
                value={formData.custom_industry}
                onChange={handleInputChange}
                required
                placeholder="הזן את תחום הפעילות שלך"
                className="text-fg placeholder:text-muted-fg border-border"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  fontSize: 14,
                }}
              />
            </div>
          )}

          {/* Street */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              רחוב ומספר <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="street"
              value={formData.street}
              onChange={handleInputChange}
              required
              placeholder="רחוב הרצל 1"
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* City */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              עיר <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              required
              placeholder="תל אביב-יפו"
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Postal Code */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>מיקוד</label>
            <input
              type="text"
              name="postal_code"
              value={formData.postal_code}
              onChange={handleInputChange}
              placeholder="1234567"
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Registration Number - Shows company_number from registration, READ ONLY */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              מספר רישום (ת.ז / ח"פ) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="company_number"
              value={formData.company_number}
              disabled
              className="text-fg bg-muted border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
                cursor: "not-allowed",
                opacity: 0.7,
              }}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              אימייל <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Mobile Phone */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>נייד</label>
            <input
              type="tel"
              name="mobile_phone"
              value={formData.mobile_phone}
              onChange={handleInputChange}
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>טלפון</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>

          {/* Website */}
          <div>
            <label className="text-fg" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>אתר אינטרנט</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              placeholder="https://example.com"
              className="text-fg placeholder:text-muted-fg border-border"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              }}
            />
          </div>
        </div>
      </div>

      {/* Template Selection Section - Simple List */}
      <div className="bg-card rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-2">בחירת תבניות מסמכים</h2>
        <p className="text-sm text-muted-fg mb-6">
          בחר תבנית ברירת מחדל לכל סוג מסמך. התבנית תשמש אוטומטית ביצירת מסמכים חדשים.
        </p>
        <SimpleTemplateSelector />
      </div>

      {/* Floating Save Button - Sticky at Bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: 24,
          zIndex: 50,
        }}
      >
        <button
          onClick={handleSaveDetails}
          disabled={isSaving}
          className="bg-fg text-bg hover:bg-fg/90"
          style={{
            padding: "16px 40px",
            borderRadius: 16,
            border: "none",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 18,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: isSaving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSaving) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 15px 30px -5px rgba(0, 0, 0, 0.4), 0 10px 15px -6px rgba(0, 0, 0, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)";
          }}
        >
          {isSaving ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 18,
                  height: 18,
                  border: "3px solid rgba(255,255,255,0.3)",
                  borderTop: "3px solid white",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              שומר...
            </>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              שמור שינויים
            </>
          )}
        </button>
      </div>

      {/* Keyframe animation for spinner */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
