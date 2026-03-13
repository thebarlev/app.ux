"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, User, Building2, ChevronDown } from "lucide-react"

type IntakeForm = {
  company_name: string
  website: string
  business_age: string
  seo_done_before: boolean
  google_ads_before: boolean
  keywords: string
  competitors: string[]
  country: string
  languages: string
  ga_status: string
  gsc_status: string
  gtm_status: string
  website_access: string
}

const defaultIntake: IntakeForm = {
  company_name: "",
  website: "",
  business_age: "",
  seo_done_before: false,
  google_ads_before: false,
  keywords: "",
  competitors: ["", "", "", "", ""],
  country: "",
  languages: "",
  ga_status: "",
  gsc_status: "",
  gtm_status: "",
  website_access: "",
}

// ─── shared style tokens ────────────────────────────────────────────────────
const font = "'DM Sans', sans-serif"

const inputBase: React.CSSProperties = {
  width: "100%",
  height: 50,
  padding: "0 14px",
  border: "1.5px solid #e2e6ea",
  borderRadius: 6,
  background: "#fff",
  fontSize: 14,
  color: "#1a1f2e",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: font,
  transition: "border-color 0.15s, box-shadow 0.15s",
}

const inputDisabled: React.CSSProperties = {
  ...inputBase,
  background: "#f8f9fb",
  color: "#9ca3af",
  cursor: "not-allowed",
}

const textareaBase: React.CSSProperties = {
  width: "100%",
  minHeight: 100,
  padding: "13px 14px",
  border: "1.5px solid #e2e6ea",
  borderRadius: 6,
  background: "#fff",
  fontSize: 14,
  color: "#1a1f2e",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: font,
  resize: "vertical",
  lineHeight: "1.5",
  transition: "border-color 0.15s, box-shadow 0.15s",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 7,
  fontFamily: font,
}

const submitBtn = (saving: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  height: 50,
  background: saving ? "#93c5fd" : "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: saving ? "not-allowed" : "pointer",
  fontFamily: font,
  letterSpacing: "0.01em",
  transition: "background 0.15s",
  marginTop: 8,
})

// ─── sub-components ──────────────────────────────────────────────────────────
function Field({ label, children, align = "right" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ ...labelStyle, textAlign: align }}>{label}</label>
      {children}
    </div>
  )
}

function FlatSelect({
  value,
  onChange,
  options,
  dir = "rtl",
  align = "right",
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  dir?: "rtl" | "ltr"
  align?: "left" | "right"
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        style={{
          ...inputBase,
          appearance: "none",
          cursor: "pointer",
          paddingRight: 40,
          color: value ? "#1a1f2e" : "#9ca3af",
          textAlign: align,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.value === ""} style={{ color: o.value ? "#1a1f2e" : "#9ca3af" }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        color="#9ca3af"
        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      />
    </div>
  )
}

function FlatCheckbox({
  id,
  checked,
  onChange,
  label,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 50,
        padding: "0 14px",
        border: `1.5px solid ${checked ? "#2563eb" : "#e2e6ea"}`,
        borderRadius: 6,
        cursor: "pointer",
        background: checked ? "#eff6ff" : "#fff",
        transition: "all 0.15s",
        userSelect: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `2px solid ${checked ? "#2563eb" : "#d1d5db"}`,
          background: checked ? "#2563eb" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ display: "none" }} />
      <span style={{ fontSize: 14, color: checked ? "#1d4ed8" : "#374151", fontWeight: checked ? 600 : 400, fontFamily: font }}>
        {label}
      </span>
    </label>
  )
}

function StatusRow({ gaStatus, gscStatus, gtmStatus, onChange, locale }: {
  gaStatus: string; gscStatus: string; gtmStatus: string
  onChange: (key: "ga_status" | "gsc_status" | "gtm_status", v: string) => void
  locale: "he" | "en"
}) {
  const isLtr = locale === "en"
  const statusOptions = [
    { value: "", label: isLtr ? "Select status" : "בחרו סטטוס" },
    { value: "connected", label: "Connected" },
    { value: "not_connected", label: "Not connected" },
    { value: "need_help", label: "Need help" },
  ]

  const dot = (v: string) => {
    if (v === "connected") return "#22c55e"
    if (v === "not_connected") return "#ef4444"
    if (v === "need_help") return "#f59e0b"
    return "#d1d5db"
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
      {(["GA", "GSC", "GTM"] as const).map((tool, i) => {
        const key = (["ga_status", "gsc_status", "gtm_status"] as const)[i]
        const val = [gaStatus, gscStatus, gtmStatus][i]
        return (
          <div key={tool}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, justifyContent: isLtr ? "flex-start" : "flex-start" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dot(val),
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ ...labelStyle, marginBottom: 0, textAlign: isLtr ? "left" : "right" }}>{tool} {isLtr ? "Status" : "Status"}</span>
            </div>
            <div style={{ position: "relative" }}>
              <select
                value={val}
                onChange={(e) => onChange(key, e.target.value)}
                style={{ ...inputBase, appearance: "none", cursor: "pointer", paddingRight: 32, color: val ? "#1a1f2e" : "#9ca3af", fontSize: 13, textAlign: isLtr ? "left" : "right" }}
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} color="#9ca3af" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
            {val === "connected" && (
              <div style={{
                marginTop: 8,
                padding: "9px 12px",
                background: "#f0f7ff",
                border: "1.5px solid #dbeafe",
                borderRadius: 6,
                fontSize: 12,
                color: "#6b7280",
                fontFamily: font,
                lineHeight: 1.5,
              }}>
                {isLtr ? "Please grant access to " : "נא לתת הרשאת גישה ל־"}{" "}
                <a
                  href="mailto:support@vow.co.il"
                  style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none", borderBottom: "1px solid #bfdbfe" }}
                >
                  support@vow.co.il
                </a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AuditorSettingsClient({ locale = "he" }: { locale?: "he" | "en" }) {
  const isLtr = locale === "en"
  const align = isLtr ? "left" : "right"
  const textDir = isLtr ? "ltr" : "rtl"
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<"personal" | "business">("personal")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [phone, setPhone] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [address, setAddress] = useState("")
  const [website, setWebsite] = useState("")
  const [contactName, setContactName] = useState("")
  const [intake, setIntake] = useState<IntakeForm>(defaultIntake)
  const [loading, setLoading] = useState(true)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPersonal, setSuccessPersonal] = useState(false)
  const [successBusiness, setSuccessBusiness] = useState(false)

  const t = {
    pageTitle: isLtr ? "Account settings" : "הגדרות חשבון",
    pageDesc: isLtr ? "Update your personal details and business information." : "עדכנו את הפרטים האישיים ופרטי העסק שלכם.",
    personalTab: isLtr ? "Personal details" : "פרטים אישיים",
    businessTab: isLtr ? "Business details" : "פרטי העסק",
    loading: isLtr ? "Loading..." : "טוען…",
    saveSuccess: isLtr ? "Saved successfully" : "נשמר בהצלחה ✓",
    savePersonal: isLtr ? "Save personal details" : "שמור פרטים אישיים ←",
    saveBusiness: isLtr ? "Save business details" : "שמור פרטי עסק ←",
    saving: isLtr ? "Saving..." : "שומר…",
    fullName: isLtr ? "Full name" : "שם מלא",
    email: isLtr ? "Email" : "אימייל",
    companyName: isLtr ? "Company name" : "שם החברה",
    phone: isLtr ? "Phone" : "טלפון",
    mobile: isLtr ? "Mobile" : "נייד",
    address: isLtr ? "Address" : "כתובת",
    website: isLtr ? "Website" : "אתר",
    contactName: isLtr ? "Contact name" : "שם איש קשר",
    businessAge: isLtr ? "Business age" : "ותק העסק",
    country: isLtr ? "Country" : "מדינה",
    languages: isLtr ? "Languages" : "שפות",
    priorMarketing: isLtr ? "Previous marketing experience" : "ניסיון שיווקי קודם",
    priorSeo: isLtr ? "Previous SEO experience" : "ניסיון קודם ב-SEO",
    priorAds: isLtr ? "Previous Google Ads experience" : "ניסיון קודם ב-Google Ads",
    keywords: isLtr ? "Keywords" : "מילות מפתח",
    competitors: isLtr ? "Competitors" : "מתחרים",
    competitorPlaceholder: isLtr ? "Competitor" : "מתחרה",
    websiteAccess: isLtr ? "Website access" : "גישה לאתר",
    settingsBadge: "SETTINGS",
    loadError: isLtr ? "Failed to load settings" : "שגיאה בטעינה",
    saveError: isLtr ? "Failed to save changes" : "שגיאה בשמירה",
  }

  const businessAgeOptions = [
    { value: "", label: isLtr ? "Select business age" : "בחרו ותק עסקי" },
    { value: "0-1", label: "0–1 years" },
    { value: "1-3", label: "1–3 years" },
    { value: "3-5", label: "3–5 years" },
    { value: "5+", label: "5+ years" },
  ]

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/auditor/settings").then((r) => r.json().catch(() => null)),
      fetch("/api/auditor/intake").then((r) => r.json().catch(() => null)),
    ])
      .then(([settingsJson, intakeJson]) => {
        if (cancelled) return
        const settingsCompanyName = settingsJson?.ok === true ? String(settingsJson.company_name || "") : ""
        if (settingsJson?.ok === true) {
          setFullName(settingsJson.full_name || "")
          setEmail(settingsJson.email || "")
          setCompanyName(settingsJson.company_name || "")
          setPhone(settingsJson.phone || "")
          setMobilePhone(settingsJson.mobile_phone || "")
          setAddress(settingsJson.address || "")
          setWebsite(settingsJson.website || "")
          setContactName(settingsJson.contact_name || "")
        }
        if (intakeJson?.ok === true && intakeJson.intake) {
          setIntake({
            ...defaultIntake,
            ...intakeJson.intake,
            company_name: String(intakeJson.intake.company_name || settingsCompanyName || ""),
            competitors: Array.isArray(intakeJson.intake.competitors)
              ? [...intakeJson.intake.competitors, "", "", "", "", ""].slice(0, 5)
              : defaultIntake.competitors,
          })
        } else if (settingsCompanyName) {
          setIntake((prev) => ({
            ...prev,
            company_name: settingsCompanyName,
          }))
        }
        if (settingsJson?.ok !== true && intakeJson?.ok !== true) {
          setError(t.loadError)
        }
      })
      .catch(() => { if (!cancelled) setError(t.loadError) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t.loadError])

  const handlePersonalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setSuccessPersonal(false); setSavingPersonal(true)
    try {
      const r = await fetch("/api/auditor/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_name: companyName.trim(), phone: phone.trim(), mobile_phone: mobilePhone.trim(), address: address.trim(), website: website.trim(), contact_name: contactName.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(isLtr ? t.saveError : (j?.error || t.saveError))
      setSuccessPersonal(true)
    } catch (e: any) { setError(String(e?.message || t.saveError)) }
    finally { setSavingPersonal(false) }
  }

  const setIntakeField = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) =>
    setIntake((prev) => ({ ...prev, [key]: value }))

  const setCompetitor = (index: number, value: string) =>
    setIntake((prev) => { const next = [...prev.competitors]; next[index] = value; return { ...prev, competitors: next } })

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setSuccessBusiness(false); setSavingBusiness(true)
    try {
      const r = await fetch("/api/auditor/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...intake, competitors: intake.competitors.map((c) => c.trim()).filter(Boolean).join("\n") }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || j?.ok !== true) throw new Error(isLtr ? t.saveError : (j?.error || t.saveError))
      setSuccessBusiness(true)
    } catch (e: any) { setError(String(e?.message || t.saveError)) }
    finally { setSavingBusiness(false) }
  }

  const tabs: { key: "personal" | "business"; label: string; icon: React.ReactNode }[] = [
    { key: "personal", label: t.personalTab, icon: <User size={15} /> },
    { key: "business", label: t.businessTab, icon: <Building2 size={15} /> },
  ]

  useEffect(() => {
    const requestedTab = searchParams.get("tab")
    if (requestedTab !== "business" && requestedTab !== "personal") return

    setActiveTab(requestedTab)

    if (requestedTab === "business" && typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("business-details")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }, 0)
    }
  }, [searchParams])

  const AlertBanner = ({ type, message }: { type: "error" | "success"; message: string }) => (
    <div style={{
      marginBottom: 20,
      padding: "13px 16px",
      background: type === "error" ? "#fef2f2" : "#f0fdf4",
      border: `1.5px solid ${type === "error" ? "#fecaca" : "#bbf7d0"}`,
      borderRadius: 6,
      fontSize: 13,
      color: type === "error" ? "#dc2626" : "#16a34a",
      fontFamily: font,
    }}>
      {message}
    </div>
  )

  return (
    <>
      <style jsx global>{`
        input:focus:not(:disabled), select:focus, textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important;
        }
        input::placeholder, textarea::placeholder { color: #c4c9d4; }
        button[type="submit"]:hover:not(:disabled) { background: #1d4ed8 !important; }
      `}</style>

      <div dir={textDir} style={{ maxWidth: 666, margin: "0 auto", padding: "48px 24px 80px", fontFamily: font }}>

        {/* Page header */}
        <div style={{ marginBottom: 36, textAlign: align }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#eff6ff", border: "1px solid #bfdbfe",
            borderRadius: 20, padding: "4px 12px", marginBottom: 16,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, letterSpacing: "0.04em" }}>{t.settingsBadge}</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1a1f2e", margin: "0 0 8px", lineHeight: 1.3 }}>{t.pageTitle}</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>{t.pageDesc}</p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid #f0f2f5",
          marginBottom: 32,
        }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setError(null) }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 20px",
                  height: 44,
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? "#2563eb" : "#6b7280",
                  fontFamily: font,
                  transition: "color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9ca3af", fontSize: 14, fontFamily: font }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            {t.loading}
          </div>
        )}

        {/* ── Personal tab ── */}
        {!loading && activeTab === "personal" && (
          <form onSubmit={handlePersonalSubmit}>
            {error && <AlertBanner type="error" message={error} />}
            {successPersonal && <AlertBanner type="success" message={t.saveSuccess} />}

            <Field label={t.fullName} align={align}>
              <input style={{ ...inputDisabled, textAlign: align }} value={fullName} disabled dir={textDir} />
            </Field>

            <Field label={t.email} align={align}>
              <input style={inputDisabled} value={email} disabled dir="ltr" />
            </Field>

            <Field label={t.companyName} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={isLtr ? "Company name" : "שם החברה"} />
            </Field>

            <Field label={t.phone} align={align}>
              <input style={inputBase} dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+972-XX-XXXXXXX" />
            </Field>

            <Field label={t.mobile} align={align}>
              <input style={inputBase} dir="ltr" type="tel" value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} placeholder="+972-5X-XXXXXXX" />
            </Field>

            <Field label={t.address} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={isLtr ? "Street, city" : "רחוב, עיר"} />
            </Field>

            <Field label={t.website} align={align}>
              <input style={{ ...inputBase, textAlign: "left" }} dir="ltr" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="name.something" />
            </Field>

            <Field label={t.contactName} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={isLtr ? "Full contact name" : "שם פרטי ומשפחה"} />
            </Field>

            <button type="submit" disabled={savingPersonal} style={submitBtn(savingPersonal)}>
              {savingPersonal ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.saving}</> : t.savePersonal}
            </button>
          </form>
        )}

        {/* ── Business tab ── */}
        {!loading && activeTab === "business" && (
          <form id="business-details" onSubmit={handleBusinessSubmit}>
            {error && <AlertBanner type="error" message={error} />}
            {successBusiness && <AlertBanner type="success" message={t.saveSuccess} />}

            <Field label={t.companyName} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={intake.company_name} onChange={(e) => setIntakeField("company_name", e.target.value)} placeholder={isLtr ? "Company name" : "שם החברה"} />
            </Field>

            <Field label={t.website} align={align}>
              <input style={{ ...inputBase, textAlign: "left" }} dir="ltr" value={intake.website} onChange={(e) => setIntakeField("website", e.target.value)} placeholder="name.something" />
            </Field>

            <Field label={t.businessAge} align={align}>
              <FlatSelect value={intake.business_age} onChange={(v) => setIntakeField("business_age", v)} options={businessAgeOptions} dir={textDir} align={align} />
            </Field>

            <Field label={t.country} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={intake.country} onChange={(e) => setIntakeField("country", e.target.value)} placeholder={isLtr ? "United States" : "Israel"} />
            </Field>

            <Field label={t.languages} align={align}>
              <input style={{ ...inputBase, textAlign: align }} dir={textDir} value={intake.languages} onChange={(e) => setIntakeField("languages", e.target.value)} placeholder={isLtr ? "English, Hebrew" : "Hebrew, English"} />
            </Field>

            <Field label={t.priorMarketing} align={align}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <FlatCheckbox id="seo_done_before" checked={intake.seo_done_before} onChange={(v) => setIntakeField("seo_done_before", v)} label={t.priorSeo} />
                <FlatCheckbox id="google_ads_before" checked={intake.google_ads_before} onChange={(v) => setIntakeField("google_ads_before", v)} label={t.priorAds} />
              </div>
            </Field>

            <StatusRow
              gaStatus={intake.ga_status}
              gscStatus={intake.gsc_status}
              gtmStatus={intake.gtm_status}
              onChange={(key, v) => setIntakeField(key, v)}
              locale={locale}
            />

            <Field label={t.keywords} align={align}>
              <textarea style={{ ...textareaBase, textAlign: align }} dir={textDir} value={intake.keywords} onChange={(e) => setIntakeField("keywords", e.target.value)} placeholder={isLtr ? "Keywords, services, target audience" : "מילות מפתח, שירותים, קהל יעד"} />
            </Field>

            <Field label={t.competitors} align={align}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <input
                    key={i}
                    style={{ ...inputBase, textAlign: align }}
                    dir={textDir}
                    value={intake.competitors[i] || ""}
                    onChange={(e) => setCompetitor(i, e.target.value)}
                    placeholder={`${t.competitorPlaceholder} ${i + 1}`}
                  />
                ))}
              </div>
            </Field>

            <Field label={t.websiteAccess} align={align}>
              <textarea style={{ ...textareaBase, textAlign: align }} dir={textDir} value={intake.website_access} onChange={(e) => setIntakeField("website_access", e.target.value)} placeholder={isLtr ? "CMS, hosting, contacts, limitations" : "CMS, hosting, אנשי קשר, הגבלות"} />
            </Field>

            <button type="submit" disabled={savingBusiness} style={submitBtn(savingBusiness)}>
              {savingBusiness ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.saving}</> : t.saveBusiness}
            </button>
          </form>
        )}
      </div>
    </>
  )
}