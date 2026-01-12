"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
    <Card className="p-8">
      <CardContent className="p-0">
        <div className="mb-8">
          <h2 className="text-right mb-2">פרטים אישיים</h2>
          <p className="text-right" style={{ color: 'var(--muted-fg)', fontSize: '16px' }}>נתחיל עם הפרטים שלך</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-right">
              שם פרטי <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Input
              id="firstName"
              type="text"
              required
              aria-required="true"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? "firstName-error" : undefined}
              className={errors.firstName ? "border-danger focus:ring-danger" : ""}
              placeholder="ישראל"
              value={data.firstName}
              onChange={(e) => updateData({ firstName: e.target.value })}
            />
            {errors.firstName && (
              <p id="firstName-error" className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.firstName}
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-right">
              שם משפחה <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Input
              id="lastName"
              type="text"
              required
              aria-required="true"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              className={errors.lastName ? "border-danger focus:ring-danger" : ""}
              placeholder="ישראלי"
              value={data.lastName}
              onChange={(e) => updateData({ lastName: e.target.value })}
            />
            {errors.lastName && (
              <p id="lastName-error" className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-right">
            כתובת אימייל <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            required
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : "email-hint"}
            className={errors.email ? "border-danger focus:ring-danger text-left" : "text-left"}
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
            <p id="email-hint" className="text-xs mt-1" style={{ color: 'var(--muted-fg)' }}>
              נשתמש בכתובת זו להתחברות למערכת
            </p>
          )}
          {errors.email && (
            <div className="mt-1">
              <p id="email-error" className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
                {errors.email}
              </p>
              {emailExists && (
                <div className="mt-2">
                  <Link 
                    href="/login" 
                    className="inline-flex items-center gap-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-[5px]"
                    style={{ color: 'var(--link)' }}
                  >
                    ← חזרה להתחברות
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-right">
            טלפון נייד <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            required
            aria-required="true"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
            className={errors.phone ? "border-danger focus:ring-danger text-left" : "text-left"}
            placeholder="050-1234567"
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            dir="ltr"
          />
          {!errors.phone && (
            <p id="phone-hint" className="text-xs mt-1" style={{ color: 'var(--muted-fg)' }}>
              פורמט: 050-1234567
            </p>
          )}
          {errors.phone && (
            <p id="phone-error" className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
              {errors.phone}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-right">
            סיסמה <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              aria-required="true"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              className={errors.password ? "border-danger focus:ring-danger text-left pr-12" : "text-left pr-12"}
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
              className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-[5px]"
              style={{ color: 'var(--muted-fg)' }}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!errors.password && (
            <p id="password-hint" className="text-xs mt-1" style={{ color: 'var(--muted-fg)' }}>
              מינימום 8 תווים
            </p>
          )}
          {errors.password && (
            <p id="password-error" className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <Button 
          type="submit" 
          variant="primary"
          className="w-full"
          disabled={isCheckingEmail}
          aria-busy={isCheckingEmail}
          loading={isCheckingEmail}
        >
          {isCheckingEmail ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin ml-2" aria-hidden="true" />
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
