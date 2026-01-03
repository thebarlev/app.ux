"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicInput } from "./neumorphic-input"
import { NeumorphicSelect } from "./neumorphic-select"
import { NeumorphicButton } from "./neumorphic-button"

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
  { value: "partnership", label: "שותפות" },
]

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
]

export function StepBusinessProfile() {
  const { data, updateData, nextStep } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.businessName.trim()) newErrors.businessName = "שדה חובה"
    if (!data.businessType) newErrors.businessType = "שדה חובה"
    if (!data.companyNumber.trim()) newErrors.companyNumber = "שדה חובה"
    if (!data.industry) newErrors.industry = "שדה חובה"
    
    // אם בחר "אחר" - חובה למלא תחום פעילות מותאם אישית
    if (data.industry === "other" && !data.customIndustry.trim()) {
      newErrors.customIndustry = "שדה חובה כאשר בוחרים 'אחר'"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      nextStep()
    }
  }

  return (
    <div className="ui-card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ui-text">פרופיל עסקי</h2>
        <p className="mt-2 ui-text-muted">ספר לנו על העסק שלך</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="businessName" className="ui-label">
            שם העסק
          </label>
          <input
            id="businessName"
            type="text"
            className={errors.businessName ? "ui-input-error" : "ui-input"}
            placeholder="שם העסק המלא"
            value={data.businessName}
            onChange={(e) => updateData({ businessName: e.target.value })}
          />
          {errors.businessName && <p className="text-sm text-ui-danger mt-1">{errors.businessName}</p>}
        </div>

        <div>
          <label htmlFor="businessType" className="ui-label">
            סוג העסק
          </label>
          <select
            id="businessType"
            className={errors.businessType ? "ui-select border-ui-danger" : "ui-select"}
            value={data.businessType}
            onChange={(e) => updateData({ businessType: e.target.value as typeof data.businessType })}
          >
            <option value="">בחר סוג עסק</option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {errors.businessType && <p className="text-sm text-ui-danger mt-1">{errors.businessType}</p>}
        </div>

        <div>
          <label htmlFor="companyNumber" className="ui-label">
            מספר חברה / תעודת זהות
          </label>
          <input
            id="companyNumber"
            type="text"
            className={errors.companyNumber ? "ui-input-error text-left" : "ui-input text-left"}
            placeholder="123456789"
            value={data.companyNumber}
            onChange={(e) => updateData({ companyNumber: e.target.value })}
            dir="ltr"
          />
          {errors.companyNumber && <p className="text-sm text-ui-danger mt-1">{errors.companyNumber}</p>}
        </div>

        <div>
          <label htmlFor="industry" className="ui-label">
            תחום פעילות
          </label>
          <select
            id="industry"
            className={errors.industry ? "ui-select border-ui-danger" : "ui-select"}
            value={data.industry}
            onChange={(e) => updateData({ industry: e.target.value })}
          >
            <option value="">בחר תחום</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
          {errors.industry && <p className="text-sm text-ui-danger mt-1">{errors.industry}</p>}
        </div>

        {data.industry === "other" && (
          <div>
            <label htmlFor="customIndustry" className="ui-label">
              פרט תחום פעילות
            </label>
            <input
              id="customIndustry"
              type="text"
              className={errors.customIndustry ? "ui-input-error" : "ui-input"}
              placeholder="הזן את תחום הפעילות שלך"
              value={data.customIndustry}
              onChange={(e) => updateData({ customIndustry: e.target.value })}
            />
            {errors.customIndustry && <p className="text-sm text-ui-danger mt-1">{errors.customIndustry}</p>}
          </div>
        )}

        <button type="submit" className="ui-button-primary w-full">
          המשך לשלב הבא
        </button>
      </form>
    </div>
  )
}
