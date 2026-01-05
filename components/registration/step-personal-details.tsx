"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicInput } from "./neumorphic-input"
import { NeumorphicButton } from "./neumorphic-button"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { checkEmailExists } from "@/app/register/actions"
import Link from "next/link"

export function StepPersonalDetails() {
  const { data, updateData, nextStep, error, setError } = useRegistration()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [emailExists, setEmailExists] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // First validate all fields
    if (!validate()) {
      return
    }

    // Then check if email already exists
    setIsCheckingEmail(true)
    setError(null)
    setEmailExists(false)

    try {
      const result = await checkEmailExists(data.email)

      if ("error" in result) {
        // Network or server error
        setError(result.message)
        setIsCheckingEmail(false)
        return
      }

      if (result.exists) {
        // Email is already registered
        setEmailExists(true)
        setErrors(prev => ({
          ...prev,
          email: result.message
        }))
        setIsCheckingEmail(false)
        return
      }

      // Email is available - proceed to next step
      setIsCheckingEmail(false)
      nextStep()

    } catch (err) {
      console.error("Error checking email:", err)
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
      setIsCheckingEmail(false)
    }
  }

  return (
    <div className="ui-card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ui-text">פרטים אישיים</h2>
        <p className="mt-2 ui-text-muted">נתחיל עם הפרטים שלך</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Form-level error announcement region */}
        {error && (
          <div className="ui-alert-danger" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="ui-label">
              שם פרטי <span className="text-ui-danger" aria-label="שדה חובה">*</span>
            </label>
            <input
              id="firstName"
              type="text"
              required
              aria-required="true"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? "firstName-error" : undefined}
              className={errors.firstName ? "ui-input-error" : "ui-input"}
              placeholder="ישראל"
              value={data.firstName}
              onChange={(e) => updateData({ firstName: e.target.value })}
            />
            {errors.firstName && (
              <p id="firstName-error" className="text-sm text-ui-danger mt-1" role="alert">
                {errors.firstName}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="lastName" className="ui-label">
              שם משפחה <span className="text-ui-danger" aria-label="שדה חובה">*</span>
            </label>
            <input
              id="lastName"
              type="text"
              required
              aria-required="true"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              className={errors.lastName ? "ui-input-error" : "ui-input"}
              placeholder="ישראלי"
              value={data.lastName}
              onChange={(e) => updateData({ lastName: e.target.value })}
            />
            {errors.lastName && (
              <p id="lastName-error" className="text-sm text-ui-danger mt-1" role="alert">
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="ui-label">
            כתובת אימייל <span className="text-ui-danger" aria-label="שדה חובה">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : "email-hint"}
            className={errors.email ? "ui-input-error text-left" : "ui-input text-left"}
            placeholder="israel@example.com"
            value={data.email}
            onChange={(e) => {
              updateData({ email: e.target.value })
              // Clear email error when user types
              if (errors.email) {
                setErrors(prev => ({ ...prev, email: "" }))
                setEmailExists(false)
              }
            }}
            dir="ltr"
          />
          {!errors.email && (
            <p id="email-hint" className="text-xs text-ui-text-muted mt-1">
              נשתמש בכתובת זו להתחברות למערכת
            </p>
          )}
          {errors.email && (
            <div className="mt-1">
              <p id="email-error" className="text-sm text-ui-danger" role="alert">
                {errors.email}
              </p>
              {emailExists && (
                <div className="mt-2">
                  <Link 
                    href="/login" 
                    className="inline-flex items-center gap-1 text-sm text-ui-primary hover:text-ui-primary-hover font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 rounded-sm"
                  >
                    ← חזרה להתחברות
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="ui-label">
            טלפון נייד <span className="text-ui-danger" aria-label="שדה חובה">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            aria-required="true"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
            className={errors.phone ? "ui-input-error text-left" : "ui-input text-left"}
            placeholder="050-1234567"
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            dir="ltr"
          />
          {!errors.phone && (
            <p id="phone-hint" className="text-xs text-ui-text-muted mt-1">
              פורמט: 050-1234567
            </p>
          )}
          {errors.phone && (
            <p id="phone-error" className="text-sm text-ui-danger mt-1" role="alert">
              {errors.phone}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="ui-label">
            סיסמה <span className="text-ui-danger" aria-label="שדה חובה">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              aria-required="true"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              className={errors.password ? "ui-input-error text-left pl-12" : "ui-input text-left pl-12"}
              placeholder="לפחות 8 תווים"
              value={data.password}
              onChange={(e) => updateData({ password: e.target.value })}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
              aria-pressed={showPassword}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ui-text-muted hover:text-ui-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 rounded-sm"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!errors.password && (
            <p id="password-hint" className="text-xs text-ui-text-muted mt-1">
              מינימום 8 תווים
            </p>
          )}
          {errors.password && (
            <p id="password-error" className="text-sm text-ui-danger mt-1" role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <button 
          type="submit" 
          className="ui-button-primary w-full"
          disabled={isCheckingEmail}
          aria-busy={isCheckingEmail}
        >
          {isCheckingEmail ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              בודק זמינות אימייל...
            </span>
          ) : (
            "המשך לשלב הבא"
          )}
        </button>
      </form>
    </div>
  )
}
