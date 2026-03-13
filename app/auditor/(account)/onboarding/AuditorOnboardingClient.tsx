"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Building2, BarChart2, Target, Lock, ChevronDown } from "lucide-react"

export type AuditorIntakeFormData = {
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
  fontFamily: "'DM Sans', sans-serif",
  transition: "border-color 0.15s",
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
  fontFamily: "'DM Sans', sans-serif",
  resize: "vertical",
  lineHeight: "1.5",
  transition: "border-color 0.15s",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 7,
  fontFamily: "'DM Sans', sans-serif",
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 32,
  borderTop: "2px solid #f0f2f5",
  paddingTop: 28,
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 24,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#1a1f2e",
  fontFamily: "'DM Sans', sans-serif",
  margin: 0,
}

const sectionSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9ca3af",
  fontFamily: "'DM Sans', sans-serif",
  marginTop: 2,
}

const connectedHelperStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 18,
  color: "#000000",
  lineHeight: 1.5,
  fontFamily: "'DM Sans', sans-serif",
}

const iconWrapStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "#f0f2f5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
}

function FlatSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputBase,
          appearance: "none",
          cursor: "pointer",
          paddingRight: 40,
          color: value ? "#1a1f2e" : "#9ca3af",
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
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
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: "none" }}
      />
      <span
        style={{
          fontSize: 14,
          color: checked ? "#1d4ed8" : "#374151",
          fontWeight: checked ? 600 : 400,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {label}
      </span>
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export default function AuditorOnboardingClient({ initialData }: { initialData: AuditorIntakeFormData }) {
  const router = useRouter()
  const [form, setForm] = useState<AuditorIntakeFormData>(initialData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = <K extends keyof AuditorIntakeFormData>(key: K, value: AuditorIntakeFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setCompetitor = (index: number, value: string) => {
    setForm((prev) => {
      const next = [...prev.competitors]
      next[index] = value
      return { ...prev, competitors: next }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/auditor/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          competitors: form.competitors.map((item) => item.trim()).filter(Boolean).join("\n"),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || json?.ok !== true) throw new Error(json?.error || "שגיאה בשמירת השאלון")
      router.push("/auditor/dashboard")
      router.refresh()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const statusOptions = [
    { value: "connected", label: "Connected" },
    { value: "not_connected", label: "Not connected" },
    { value: "need_help", label: "Need help" },
  ]

  return (
    <>
      <style jsx global>{`
        input:focus, select:focus, textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important;
        }
        input::placeholder, textarea::placeholder { color: #c4c9d4; }
        button:hover:not(:disabled) { background: #1d4ed8 !important; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div
        dir="rtl"
        style={{
          maxWidth: 666,
          margin: "0 auto",
          padding: "48px 24px 80px",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "right" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 20,
              padding: "4px 12px",
              marginBottom: 16,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, letterSpacing: "0.04em" }}>
              AUDITOR SETUP
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1a1f2e", margin: "0 0 8px", lineHeight: 1.3 }}>
            היכרות ראשונית עם העסק
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
            מלאו כמה פרטים כדי שנוכל להתאים את תהליך ה-Auditor לעסק שלכם.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                marginBottom: 24,
                padding: "14px 16px",
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: 6,
                fontSize: 14,
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}

          {/* Section: Business */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div style={iconWrapStyle}>
                <Building2 size={16} color="#6b7280" />
              </div>
              <div>
                <p style={sectionTitleStyle}>Business</p>
                <p style={sectionSubStyle}>פרטי העסק והאתר</p>
              </div>
            </div>

            <Field label="Company name">
              <input
                style={inputBase}
                dir="rtl"
                value={form.company_name}
                onChange={(e) => setField("company_name", e.target.value)}
                placeholder="שם החברה"
              />
            </Field>

            <Field label="Website">
              <input
                style={inputBase}
                dir="ltr"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://example.com"
              />
            </Field>

            <Field label="Business age">
              <FlatSelect
                value={form.business_age}
                onChange={(v) => setField("business_age", v)}
                placeholder="בחרו ותק עסקי"
                options={[
                  { value: "0-1", label: "0–1 years" },
                  { value: "1-3", label: "1–3 years" },
                  { value: "3-5", label: "3–5 years" },
                  { value: "5+", label: "5+ years" },
                ]}
              />
            </Field>

            <Field label="Country">
              <input
                style={inputBase}
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
                placeholder="Israel"
              />
            </Field>

            <Field label="Languages">
              <input
                style={inputBase}
                value={form.languages}
                onChange={(e) => setField("languages", e.target.value)}
                placeholder=""
              />
            </Field>
          </div>

          {/* Section: Marketing */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div style={iconWrapStyle}>
                <BarChart2 size={16} color="#6b7280" />
              </div>
              <div>
                <p style={sectionTitleStyle}>Marketing</p>
                <p style={sectionSubStyle}>סטטוס חיבורים וניסיון שיווקי קודם</p>
              </div>
            </div>

            <Field label="Prior experience">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <FlatCheckbox
                  id="seo_done_before"
                  checked={form.seo_done_before}
                  onChange={(v) => setField("seo_done_before", v)}
                  label="SEO done before"
                />
                <FlatCheckbox
                  id="google_ads_before"
                  checked={form.google_ads_before}
                  onChange={(v) => setField("google_ads_before", v)}
                  label="Google Ads before"
                />
              </div>
            </Field>

            <Field label="GA status">
              <>
                <FlatSelect
                  value={form.ga_status}
                  onChange={(v) => setField("ga_status", v)}
                  placeholder="בחרו סטטוס"
                  options={statusOptions}
                />
                {form.ga_status === "connected" && (
                  <div style={connectedHelperStyle}>נא לתת הרשאה ל support@vow.co.il</div>
                )}
              </>
            </Field>

            <Field label="GSC status">
              <>
                <FlatSelect
                  value={form.gsc_status}
                  onChange={(v) => setField("gsc_status", v)}
                  placeholder="בחרו סטטוס"
                  options={statusOptions}
                />
                {form.gsc_status === "connected" && (
                  <div style={connectedHelperStyle}>נא לתת הרשאה ל support@vow.co.il</div>
                )}
              </>
            </Field>

            <Field label="GTM status">
              <>
                <FlatSelect
                  value={form.gtm_status}
                  onChange={(v) => setField("gtm_status", v)}
                  placeholder="בחרו סטטוס"
                  options={statusOptions}
                />
                {form.gtm_status === "connected" && (
                  <div style={connectedHelperStyle}>נא לתת הרשאה ל support@vow.co.il</div>
                )}
              </>
            </Field>
          </div>

          {/* Section: SEO Goals */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div style={iconWrapStyle}>
                <Target size={16} color="#6b7280" />
              </div>
              <div>
                <p style={sectionTitleStyle}>SEO Goals</p>
                <p style={sectionSubStyle}>מילות מפתח ומתחרים רלוונטיים</p>
              </div>
            </div>

            <Field label="Keywords">
              <textarea
                style={textareaBase}
                value={form.keywords}
                onChange={(e) => setField("keywords", e.target.value)}
                placeholder="Primary keywords, services, audience"
              />
            </Field>

            <Field label="Competitors">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <input
                    key={index}
                    style={inputBase}
                    value={form.competitors[index] || ""}
                    onChange={(e) => setCompetitor(index, e.target.value)}
                    placeholder="Competitor websites or brand names"
                  />
                ))}
              </div>
            </Field>
          </div>

          {/* Section: Access */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div style={iconWrapStyle}>
                <Lock size={16} color="#6b7280" />
              </div>
              <div>
                <p style={sectionTitleStyle}>Access Permissions</p>
                <p style={sectionSubStyle}>גישה לאתר ולמערכות המדידה</p>
              </div>
            </div>

            <Field label="Website access">
              <textarea
                style={textareaBase}
                value={form.website_access}
                onChange={(e) => setField("website_access", e.target.value)}
                placeholder="CMS access, hosting notes, deployment constraints, contact person"
              />
            </Field>
          </div>

          {/* Submit */}
          <div style={{ marginTop: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 50,
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: "0.01em",
                transition: "background 0.15s",
              }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  שומר…
                </>
              ) : (
                "שמור והמשך לדשבורד ←"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}