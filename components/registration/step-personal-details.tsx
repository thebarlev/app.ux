"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { Card, CardContent } from "@/components/ui/card"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { checkEmailExists } from "@/app/register/actions"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface StepPersonalDetailsProps {
  legalTermsText: string
  marketingText: string
  requireLegalTermsRequired: boolean
  requireMarketingRequired: boolean
  loginHref?: string
}

export function StepPersonalDetails({ 
  legalTermsText, 
  marketingText,
  requireLegalTermsRequired,
  requireMarketingRequired,
  loginHref,
}: StepPersonalDetailsProps) {
  const { data, updateData, nextStep, error, setError } = useRegistration()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  // Use props instead of loading from client-side
  const legalTermsRequired = requireLegalTermsRequired
  const marketingRequired = requireMarketingRequired

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

    // Dynamic validation for legal terms based on system setting
    if (legalTermsRequired && !data.acceptedLegalTerms) {
      newErrors.acceptedLegalTerms = "יש לאשר את התנאים המשפטיים כדי להמשיך"
    }

    // Dynamic validation for marketing based on system setting
    if (marketingRequired && !data.acceptedMarketing) {
      newErrors.acceptedMarketing = "יש לאשר את קבלת המידע השיווקי כדי להמשיך"
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
          email: result.message ?? "האימייל כבר רשום במערכת"
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
    <Card className="shadow-ui-lg auth-card">
      <CardContent>
        <div className="pb-4 mb-[15px]">
          <h2 className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
            פרטים אישיים
          </h2>
          <p className="mr-6 text-right">נתחיל עם הפרטים שלך</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {/* Form-level error announcement region */}
        {error && (
          <div 
            className="p-4 rounded-[5px]" 
            role="alert" 
            aria-live="assertive"
            style={{ backgroundColor: 'rgba(155, 0, 3, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="auth-field">
          <FloatingInput
            label="שם פרטי"
            id="firstName"
            placeholder="ישראל"
            required
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
            error={errors.firstName}
            containerClassName="w-full min-w-0"
            className="auth-input"
            labelClassName="auth-label"
            labelPlacement="above"
          />
        </div>

        <div className="auth-field">
          <FloatingInput
            label="שם משפחה"
            id="lastName"
            placeholder="ישראלי"
            required
            value={data.lastName}
            onChange={(e) => updateData({ lastName: e.target.value })}
            error={errors.lastName}
            containerClassName="w-full min-w-0"
            className="auth-input"
            labelClassName="auth-label"
            labelPlacement="above"
          />
        </div>

        <div className="auth-field">
          <FloatingInput
            label="כתובת אימייל"
            id="email"
            type="email"
            placeholder="name@example.com"
            required
            value={data.email}
            onChange={(e) => {
              updateData({ email: e.target.value })
              if (errors.email) {
                setErrors(prev => ({ ...prev, email: "" }))
                setEmailExists(false)
              }
            }}
            dir="ltr"
            className="auth-input text-left"
            labelClassName="auth-label"
            labelPlacement="above"

            error={errors.email}
            containerClassName="w-full min-w-0"
          />
          {errors.email && emailExists && (
            <div className="mt-2">
              <Link 
                href={loginHref || "/login"}
                className="auth-link inline-flex items-center gap-1"
              >
                ← חזרה להתחברות
              </Link>
            </div>
          )}
        </div>

        <div className="auth-field">
          <FloatingInput
            label="טלפון נייד"
            id="phone"
            type="tel"
            placeholder="050-1234567"
            required
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            dir="ltr"
            className="auth-input text-left"
            labelClassName="auth-label"
            labelPlacement="above"
            error={errors.phone}
            containerClassName="w-full min-w-0"
          />
        </div>

        <div className="auth-field">
          <div className="relative">
            <FloatingInput
              label="סיסמה"
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              value={data.password}
              onChange={(e) => updateData({ password: e.target.value })}
              dir="ltr"
              className="auth-input text-left pr-12"
              labelClassName="auth-label"
              labelPlacement="above"
              helperText="מינימום 8 תווים"
              error={errors.password}
              containerClassName="w-full min-w-0"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
              aria-pressed={showPassword}
              className="absolute left-4 top-[calc(50%+1px)] -translate-y-1/2 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui p-1"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Legal Terms Checkbox - Always shown, validation depends on system setting */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="legal-terms"
              checked={data.acceptedLegalTerms}
              onCheckedChange={(checked) => {
                updateData({ acceptedLegalTerms: checked === true })
                if (errors.acceptedLegalTerms) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.acceptedLegalTerms
                    return newErrors
                  })
                }
              }}
              className={cn(
                "mt-1",
                errors.acceptedLegalTerms && "border-danger"
              )}
            />
            <label
              htmlFor="legal-terms"
              className={cn(
                "auth-checkbox-label cursor-pointer",
                errors.acceptedLegalTerms && "text-danger"
              )}
              dangerouslySetInnerHTML={{ __html: legalTermsText + (legalTermsRequired ? ' <span style="color: #B91C1C">*</span>' : '') }}
            />
          </div>
          {errors.acceptedLegalTerms && (
            <p className="text-xs text-danger mt-1">{errors.acceptedLegalTerms}</p>
          )}
        </div>

        {/* Marketing Checkbox - Validation depends on system setting */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="marketing"
              checked={data.acceptedMarketing}
              onCheckedChange={(checked) => {
                updateData({ acceptedMarketing: checked === true })
                if (errors.acceptedMarketing) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.acceptedMarketing
                    return newErrors
                  })
                }
              }}
              className={cn(
                "mt-1",
                errors.acceptedMarketing && "border-danger"
              )}
            />
            <label 
              htmlFor="marketing" 
              className={cn(
                "auth-checkbox-label cursor-pointer",
                errors.acceptedMarketing && "text-danger"
              )}
              dangerouslySetInnerHTML={{ __html: marketingText + (marketingRequired ? ' <span style="color: #B91C1C">*</span>' : '') }}
            />
          </div>
          {errors.acceptedMarketing && (
            <p className="text-xs text-danger mt-1">{errors.acceptedMarketing}</p>
          )}
        </div>

        <Button 
          type="submit" 
          variant="primary"
          className="w-full auth-primary-button"
          disabled={
            isCheckingEmail || 
            (legalTermsRequired && !data.acceptedLegalTerms) ||
            (marketingRequired && !data.acceptedMarketing)
          }
          aria-busy={isCheckingEmail}
          loading={isCheckingEmail}
        >
          {isCheckingEmail ? (
            <>
              <Loader2 size={19} className="shrink-0 animate-spin ml-2" aria-hidden="true" />
              בודק זמינות אימייל...
            </>
          ) : (
            "המשך לשלב הבא"
          )}
        </Button>
      </form>
      </CardContent>
    </Card>
  )
}
