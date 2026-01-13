"use client";

import { useEffect, useState, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { FormActions } from "@/components/ui/form-actions";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Company = {
  id: string;
  company_name: string;
  company_name_en?: string | null;
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
  contact_first_name?: string | null;
  contact_first_name_en?: string | null;
  books_region?: "IL" | "OTHER" | null;
  notified_tax_officer_at?: string | null;
  notified_tax_officer_notes?: string | null;
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
  const logoObjectUrlRef = useRef<string | null>(null);
  const signatureObjectUrlRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    company_name: company.company_name || "",
    company_name_en: company.company_name_en || "",
    business_type: (company.business_type as any) || "osek_patur",
    registration_number: company.registration_number || company.company_number || "",
    industry: company.industry || "",
    custom_industry: company.custom_industry || "",
    street: company.street || "",
    city: company.city || "",
    postal_code: company.postal_code || "",
    address: "", // Auto-generated from street + city, not displayed in UI
    phone: company.phone || "",
    mobile_phone: company.mobile_phone || "",
    contact_first_name_en: company.contact_first_name_en || "",
    books_region: (company.books_region as any) || "IL",
    email: company.email || "",
    website: company.website || "",
  });

  const [logoUrl, setLogoUrl] = useState(company.logo_url);
  const [signatureUrl, setSignatureUrl] = useState(company.signature_url ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // #region agent log (hypothesisId=H10)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'runReg',hypothesisId:'H10',location:'app/dashboard/settings/SettingsClient.tsx:SettingsClient',message:'registration_number visibility check (no PII)',data:{hasRegistrationNumber:Boolean(company?.registration_number),registrationNumberLen:typeof company?.registration_number==='string'?company.registration_number.length:0,formRegistrationNumberLen:typeof (formData as any)?.registration_number==='string'?(formData as any).registration_number.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local state in sync with refreshed server props (e.g., signed URLs).
  useEffect(() => {
    if (company.logo_url && company.logo_url !== logoUrl) {
      // Revoke any previous local object URL when server URL arrives
      if (logoObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(logoObjectUrlRef.current);
        } catch {}
        logoObjectUrlRef.current = null;
      }
      setLogoUrl(company.logo_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.logo_url]);

  useEffect(() => {
    if (company.signature_url && company.signature_url !== signatureUrl) {
      if (signatureObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(signatureObjectUrlRef.current);
        } catch {}
        signatureObjectUrlRef.current = null;
      }
      setSignatureUrl(company.signature_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.signature_url]);

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(logoObjectUrlRef.current);
        } catch {}
        logoObjectUrlRef.current = null;
      }
      if (signatureObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(signatureObjectUrlRef.current);
        } catch {}
        signatureObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveDetails = async () => {
    // #region agent log (hypothesisId=H6)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H6',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Save clicked (entry)',data:{isSaving,formKeys:Object.keys(formData)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    setIsSaving(true);
    setMessage(null);

    // Validation
    if (!formData.company_name.trim()) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: company_name',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "שם העסק הוא שדה חובה" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSaving(false);
      return;
    }

    if (!formData.email.trim() || !formData.email.includes("@")) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: email',data:{hasAt:formData.email.includes("@"),emailLen:formData.email.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "נא להזין כתובת אימייל תקינה" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSaving(false);
      return;
    }

    if (!formData.industry) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run4',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: industry',data:{industry:formData.industry || null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "תחום פעילות הוא שדה חובה" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSaving(false);
      return;
    }

    if (formData.industry === "other" && !formData.custom_industry.trim()) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run4',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: custom_industry',data:{customIndustryLen:formData.custom_industry.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "נא לפרט את תחום הפעילות כאשר בוחרים 'אחר'" });
      setIsSaving(false);
      return;
    }

    if (!formData.street.trim()) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run4',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: street',data:{streetLen:formData.street.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "רחוב ומספר הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    if (!formData.city.trim()) {
      // #region agent log (hypothesisId=H7)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run4',hypothesisId:'H7',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Validation failed: city',data:{cityLen:formData.city.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

    // #region agent log (hypothesisId=H8)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H8',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'Calling updateBusinessDetailsAction',data:{payloadKeys:Object.keys(payload)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    let result: any;
    try {
      result = await updateBusinessDetailsAction(payload as BusinessDetailsPayload);
    } catch {
      // #region agent log (hypothesisId=H8)
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H8',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'updateBusinessDetailsAction threw (catch)',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMessage({ type: "error", text: "שגיאה בשמירה" });
      setIsSaving(false);
      return;
    }

    // #region agent log (hypothesisId=H8)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run3',hypothesisId:'H8',location:'app/dashboard/settings/SettingsClient.tsx:handleSaveDetails',message:'updateBusinessDetailsAction returned',data:{ok:result?.ok ?? null,hasMessage:Boolean(result?.message)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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

    // Immediate local preview (doesn't depend on storage permissions)
    if (logoObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      } catch {}
      logoObjectUrlRef.current = null;
    }
    const localPreview = URL.createObjectURL(file);
    logoObjectUrlRef.current = localPreview;
    setLogoUrl(localPreview);

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

    if (signatureObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(signatureObjectUrlRef.current);
      } catch {}
      signatureObjectUrlRef.current = null;
    }
    const localPreview = URL.createObjectURL(file);
    signatureObjectUrlRef.current = localPreview;
    setSignatureUrl(localPreview);

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
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
      <div className="ui-container pt-10">
        {/* Page Header */}
        <div className="mb-[50px]">
          <h1 className="text-right mb-4">
            הגדרות
          </h1>
          <p className="text-right">
            ניהול פרטי העסק והלוגו
          </p>
        </div>

        {/* Message */}
        {message && (
          <Card className={cn(
            "mb-[50px]",
            message.type === "success" 
              ? "border-success bg-success/10" 
              : "border-danger bg-danger/10"
          )}
          role="alert"
          aria-live="polite"
          style={{
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: message.type === "success" ? "#0F5132" : "#9B0003",
            backgroundColor: message.type === "success" ? "#E7F6EE" : "#FDECEC",
          }}
          >
            <CardContent className="p-4" style={{ padding: 16 }}>
              <p className={cn(
                message.type === "success" ? "text-success-fg" : "text-danger-fg"
              )}
              style={{
                margin: 0,
                fontWeight: 700,
                color: message.type === "success" ? "#0F5132" : "#9B0003",
              }}
              >
                {message.text}
              </p>
            </CardContent>
          </Card>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 50 }}>
          {/* Logo & Signature Section - Combined */}
          <FormSection title="לוגו וחתימת העסק">
            {/* Show installation notice if signature_url field doesn't exist */}
            {company.signature_url === undefined && (
              <Card className="mb-6 border-warning bg-warning/10">
                <CardContent className="p-4">
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#19183B' }}>📋 נדרשת התקנה לחתימה</div>
                  <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6, color: '#19183B' }}>
                    כדי להשתמש בתכונת החתימה, יש להריץ: <code style={{ padding: "2px 6px", borderRadius: 4, backgroundColor: '#EDF1F5', color: '#19183B' }}>scripts/016-add-signature-field.sql</code>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Combined Grid: Logo on Right, Signature on Left */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 24 }}>
              
              {/* Logo Section */}
              <div>
                <h3 style={{ marginBottom: 12 }}>לוגו העסק</h3>
              
                {/* Logo Preview */}
                <div
                  style={{
                    width: "100%",
                    height: 200,
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: "#EDF1F5",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                    marginBottom: 16,
                    backgroundColor: "#EDF1F5",
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
                      <div style={{ fontSize: 13, color: "#708993" }}>לא הועלה</div>
                    </div>
                  )}
                </div>

                <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
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
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    style={{ height: '50px', fontSize: '18px' }}
                  >
                    {isUploadingLogo ? "מעלה..." : logoUrl ? "החלף" : "העלה לוגו"}
                  </Button>

                  {logoUrl && (
                    <Button
                      onClick={handleDeleteLogo}
                      disabled={isUploadingLogo}
                      variant="danger"
                      style={{ height: '50px', fontSize: '18px' }}
                    >
                      מחק
                    </Button>
                  )}
                </div>
              </div>

              {/* Signature Section */}
              <div>
                <h3 style={{ marginBottom: 12 }}>חתימת העסק</h3>
                
                {/* Signature Preview */}
                <div
                  style={{
                    width: "100%",
                    height: 200,
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: "#EDF1F5",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                    marginBottom: 16,
                    backgroundColor: "#EDF1F5",
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
                      <div style={{ fontSize: 13, color: "#708993" }}>לא הועלה</div>
                    </div>
                  )}
                </div>

                <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
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
                  <Button
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={isUploadingSignature}
                    style={{ height: '50px', fontSize: '18px' }}
                  >
                    {isUploadingSignature ? "מעלה..." : signatureUrl ? "החלף" : "העלה חתימה"}
                  </Button>

                  {signatureUrl && (
                    <Button
                      onClick={handleDeleteSignature}
                      disabled={isUploadingSignature}
                      variant="danger"
                      style={{ height: '50px', fontSize: '18px' }}
                    >
                      מחק
                    </Button>
                  )}
                </div>
              </div>

            </div>
          </FormSection>

          {/* Business Details Section */}
          <FormSection title="פרטי העסק">
            <div className="ui-form-grid">
            {/* Company Name */}
            <FieldWrapper label="שם העסק" id="company_name" required>
              <Input
                type="text"
                name="company_name"
                id="company_name"
                value={formData.company_name}
                onChange={handleInputChange}
                required
              />
            </FieldWrapper>

            {/* Company Name (English) */}
            <FieldWrapper label="שם העסק (English)" id="company_name_en">
              <Input
                type="text"
                name="company_name_en"
                id="company_name_en"
                value={(formData as any).company_name_en}
                onChange={handleInputChange}
                dir="ltr"
                className="text-left"
                placeholder="Business name (English)"
              />
            </FieldWrapper>

            {/* Issuer first name (English) */}
            <FieldWrapper label="שם פרטי לחתימה (English)" id="contact_first_name_en">
              <Input
                type="text"
                name="contact_first_name_en"
                id="contact_first_name_en"
                value={(formData as any).contact_first_name_en}
                onChange={handleInputChange}
                dir="ltr"
                className="text-left"
                placeholder="First name (English)"
              />
            </FieldWrapper>

            {/* Books region (metadata) */}
            <FieldWrapper label="אזור שמירת ספרים" id="books_region">
              <Select
                value={(formData as any).books_region}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, books_region: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IL">ישראל</SelectItem>
                  <SelectItem value="OTHER">אחר</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>


            {/* Business Type - READ ONLY */}
            <FieldWrapper label="סוג עסק" id="business_type" required>
              <Select value={formData.business_type} onValueChange={(value) => setFormData(prev => ({ ...prev, business_type: value as any }))} disabled>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            {/* Registration Number (Company ID) - READ ONLY */}
            <FieldWrapper label="מספר חברה / תעודת זהות" id="registration_number" required>
              <Input
                type="text"
                name="registration_number"
                id="registration_number"
                value={formData.registration_number}
                onChange={handleInputChange}
                disabled
                required
                dir="ltr"
                className="text-left"
              />
            </FieldWrapper>

            {/* Industry */}
            <FieldWrapper label="תחום פעילות" id="industry" required>
              <Select value={formData.industry} onValueChange={(value) => setFormData(prev => ({ ...prev, industry: value }))}>
                <SelectTrigger><SelectValue placeholder="בחר תחום" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            {/* Custom Industry - shows if "other" selected */}
            {formData.industry === "other" && (
              <FieldWrapper label="פרט תחום פעילות" id="custom_industry" required>
                <Input
                  type="text"
                  name="custom_industry"
                  id="custom_industry"
                  value={formData.custom_industry}
                  onChange={handleInputChange}
                  required
                  placeholder="הזן את תחום הפעילות שלך"
                />
              </FieldWrapper>
            )}

            {/* Street */}
            <FieldWrapper label="רחוב ומספר" id="street" required>
              <Input
                type="text"
                name="street"
                id="street"
                value={formData.street}
                onChange={handleInputChange}
                required
                placeholder="רחוב הרצל 1"
              />
            </FieldWrapper>

            {/* City */}
            <FieldWrapper label="עיר" id="city" required>
              <Input
                type="text"
                name="city"
                id="city"
                value={formData.city}
                onChange={handleInputChange}
                required
                placeholder="תל אביב-יפו"
              />
            </FieldWrapper>

            {/* Postal Code */}
            <FieldWrapper label="מיקוד" id="postal_code">
              <Input
                type="text"
                name="postal_code"
                id="postal_code"
                value={formData.postal_code}
                onChange={handleInputChange}
                placeholder="1234567"
              />
            </FieldWrapper>


            {/* Email */}
            <FieldWrapper label="אימייל" id="email" required>
              <Input
                type="email"
                name="email"
                id="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </FieldWrapper>

            {/* Mobile Phone */}
            <FieldWrapper label="נייד" id="mobile_phone">
              <Input
                type="tel"
                name="mobile_phone"
                id="mobile_phone"
                value={formData.mobile_phone}
                onChange={handleInputChange}
              />
            </FieldWrapper>

            {/* Phone */}
            <FieldWrapper label="טלפון" id="phone">
              <Input
                type="tel"
                name="phone"
                id="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </FieldWrapper>

            {/* Website */}
            <FieldWrapper label="אתר אינטרנט" id="website">
              <Input
                type="url"
                name="website"
                id="website"
                value={formData.website}
                onChange={handleInputChange}
                placeholder="https://example.com"
              />
            </FieldWrapper>
            </div>
          </FormSection>

          {/* Template Selection Section - Simple List */}
          <FormSection title="בחירת תבניות מסמכים" description="בחר תבנית ברירת מחדל לכל סוג מסמך. התבנית תשמש אוטומטית ביצירת מסמכים חדשים.">
            <SimpleTemplateSelector />
          </FormSection>

          {/* Action Buttons */}
          <FormActions
            primaryLabel={isSaving ? "שומר..." : "שמור שינויים"}
            onPrimaryClick={handleSaveDetails}
            primaryLoading={isSaving}
            primaryDisabled={isSaving}
          />
        </div>
      </div>
    </main>
  );
}
