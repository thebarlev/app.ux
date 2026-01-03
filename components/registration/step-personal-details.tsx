"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicInput } from "./neumorphic-input"
import { NeumorphicButton } from "./neumorphic-button"
import { Eye, EyeOff } from "lucide-react"

export function StepPersonalDetails() {
  const { data, updateData, nextStep, error, setError } = useRegistration()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.firstName.trim()) newErrors.firstName = "שדה חובה"
    if (!data.lastName.trim()) newErrors.lastName = "שדה חובה"
    if (!data.email.trim()) {
      newErrors.email = "שדה חובה"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = "כתובת אימייל לא תקינה"
    }
    if (!data.phone.trim()) {
      newErrors.phone = "שדה חובה"
    } else if (!/^0[0-9]{8,9}$/.test(data.phone.replace(/[-\s]/g, ""))) {
      newErrors.phone = "מספר טלפון לא תקין"
    }
    if (!data.password) {
      newErrors.password = "שדה חובה"
    } else if (data.password.length < 8) {
      newErrors.password = "סיסמה חייבת להכיל לפחות 8 תווים"
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
        <h2 className="text-xl font-bold text-ui-text">פרטים אישיים</h2>
        <p className="mt-2 ui-text-muted">נתחיל עם הפרטים שלך</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="ui-label">
              שם פרטי
            </label>
            <input
              id="firstName"
              type="text"
              className={errors.firstName ? "ui-input-error" : "ui-input"}
              placeholder="ישראל"
              value={data.firstName}
              onChange={(e) => updateData({ firstName: e.target.value })}
            />
            {errors.firstName && <p className="text-sm text-ui-danger mt-1">{errors.firstName}</p>}
          </div>
          
          <div>
            <label htmlFor="lastName" className="ui-label">
              שם משפחה
            </label>
            <input
              id="lastName"
              type="text"
              className={errors.lastName ? "ui-input-error" : "ui-input"}
              placeholder="ישראלי"
              value={data.lastName}
              onChange={(e) => updateData({ lastName: e.target.value })}
            />
            {errors.lastName && <p className="text-sm text-ui-danger mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="ui-label">
            כתובת אימייל
          </label>
          <input
            id="email"
            type="email"
            className={errors.email ? "ui-input-error text-left" : "ui-input text-left"}
            placeholder="israel@example.com"
            value={data.email}
            onChange={(e) => updateData({ email: e.target.value })}
            dir="ltr"
          />
          {errors.email && <p className="text-sm text-ui-danger mt-1">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="phone" className="ui-label">
            טלפון נייד
          </label>
          <input
            id="phone"
            type="tel"
            className={errors.phone ? "ui-input-error text-left" : "ui-input text-left"}
            placeholder="050-1234567"
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            dir="ltr"
          />
          {errors.phone && <p className="text-sm text-ui-danger mt-1">{errors.phone}</p>}
        </div>

        <div>
          <label htmlFor="password" className="ui-label">
            סיסמה
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className={errors.password ? "ui-input-error text-left pl-12" : "ui-input text-left pl-12"}
              placeholder="לפחות 8 תווים"
              value={data.password}
              onChange={(e) => updateData({ password: e.target.value })}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ui-text-muted hover:text-ui-text transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-ui-danger mt-1">{errors.password}</p>}
        </div>

        {error && (
          <div className="ui-alert-danger">
            {error}
          </div>
        )}

        <button type="submit" className="ui-button-primary w-full">
          המשך לשלב הבא
        </button>
      </form>
    </div>
  )
}
