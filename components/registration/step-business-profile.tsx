"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useRegistration } from "./registration-context"
import { createClient } from "@/lib/supabase/client"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
  { value: "partnership", label: "שותפות" },
]

const INDUSTRIES = [
  "קמעונאות",
  "מסעדנות",
  "הייטק",
  "שירותים מקצועיים",
  "חינוך",
  "בריאות",
  "נדל״ן",
  "בנייה",
  "תחבורה",
  "ייעוץ",
  "שיווק דיגיטלי",
  "שירותי פרסום",
  "עיצוב",
  "פיתוח תוכנה",
  "חשבונאות",
  "משפטים",
  "רפואה אלטרנטיבית",
  "כושר וספורט",
  "יופי וטיפוח",
  "אירועים",
]

export function StepBusinessProfile() {
  const router = useRouter()
  const { data, updateData, prevStep, isLoading, setIsLoading, error, setError } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.businessName.trim()) newErrors.businessName = "שדה חובה"
    if (!data.businessType) newErrors.businessType = "שדה חובה"
    if (!data.companyNumber.trim()) newErrors.companyNumber = "שדה חובה"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const submitRegistrationFromStep2 = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // 1) Create auth user (moved from Step 3)
      let authUserId: string | null = null
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/app`,
          data: { first_name: data.firstName, last_name: data.lastName },
        },
      })

      if (signUpError) {
        const code = (signUpError as any)?.code ?? null
        if (code === "user_already_exists" || signUpError.message?.toLowerCase().includes("already")) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          })
          if (signInError || !signInData?.user?.id) {
            setError("כתובת האימייל כבר רשומה במערכת. נסה להתחבר.")
            setIsLoading(false)
            return
          }
          authUserId = signInData.user.id
        } else {
          const errorMsg = signUpError.message?.includes("already registered")
            ? "כתובת האימייל כבר רשומה במערכת. נסה להתחבר."
            : `שגיאת הרשמה: ${signUpError.message || "Unknown error"}`
          setError(errorMsg)
          setIsLoading(false)
          return
        }
      } else {
        authUserId = signUpData?.user?.id ?? null
      }

      if (!authUserId) {
        setError("ההרשמה נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      // 2) Create company + membership (keep schema-cache retry behavior)
      const baseCompanyPayload: Record<string, any> = {
        company_name: data.businessName,
        business_type: data.businessType,
        company_number: data.companyNumber || null,
        registration_number: data.companyNumber || null,
        industry: data.industry || null, // Hebrew text is source of truth
        custom_industry: data.customIndustry || null,
        contact_first_name: data.firstName,
        contact_full_name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        mobile_phone: data.phone || null,
        auth_user_id: authUserId,
        status: "active",
        accepted_legal_terms: data.acceptedLegalTerms,
        accepted_legal_terms_at: data.acceptedLegalTerms ? new Date().toISOString() : null,
        accepted_marketing: data.acceptedMarketing,
      }

      const removedCompanyCols: string[] = []
      let companyPayload: Record<string, any> = { ...baseCompanyPayload }
      let companyData: any = null
      let companyError: any = null

      for (let attempt = 0; attempt < 20; attempt++) {
        const r = await supabase.from("companies").insert(companyPayload).select("id").single()
        companyData = r.data
        companyError = r.error
        if (!companyError) break

        const code = (companyError as any)?.code ?? null
        const msg = typeof companyError.message === "string" ? companyError.message : ""
        if (code === "PGRST204") {
          const m = msg.match(/Could not find the '([^']+)' column/i)
          const missingCol = m?.[1]
          if (missingCol && Object.prototype.hasOwnProperty.call(companyPayload, missingCol)) {
            removedCompanyCols.push(missingCol)
            delete companyPayload[missingCol]
            continue
          }
        }
        break
      }

      if (companyError || !companyData?.id) {
        if ((companyError as any)?.code === "PGRST204" && typeof companyError?.message === "string") {
          setError(
            `שגיאה זמנית בשרת (Schema Cache). יש להריץ בסופאבייס: select pg_notify('pgrst','reload schema'); ואז לנסות שוב.\n` +
              `(${companyError.message})`
          )
        } else {
          setError(`שגיאה ביצירת חברה: ${companyError?.message || "Unknown error"}`)
        }
        setIsLoading(false)
        return
      }

      const insertMemberWithStatus = () =>
        supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner", status: "active" })

      const insertMemberNoStatus = () =>
        supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner" })

      let { error: memberError } = await insertMemberWithStatus()
      if (
        memberError &&
        (memberError as any)?.code === "PGRST204" &&
        typeof memberError.message === "string" &&
        memberError.message.includes("status")
      ) {
        ;({ error: memberError } = await insertMemberNoStatus())
      }

      if (memberError) {
        setError(`שגיאה ביצירת קישור לחברה: ${memberError.message || "Unknown error"}`)
        setIsLoading(false)
        return
      }

      // 3) Requirement: after Step 2 approval go to login.
      try {
        await supabase.auth.signOut()
      } catch {}

      router.replace("/login")
    } catch (e: any) {
      setError(e?.message ? `שגיאה: ${e.message}` : "שגיאה לא צפויה")
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setError(null)
    await submitRegistrationFromStep2()
  }

  return (
    <Card className="shadow-ui-lg auth-card">
      <CardContent>
        <div className="pb-4 mb-[15px]">
          <h2 className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
            פרופיל עסקי
          </h2>
          <p className="mr-6 text-right">ספר לנו על העסק שלך</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div
              className="p-4 rounded-[5px]"
              role="alert"
              aria-live="assertive"
              style={{ backgroundColor: "rgba(155, 0, 3, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              {error}
            </div>
          )}
          <div className="auth-field">
            <FloatingInput
              label="שם העסק"
              id="businessName"
              placeholder="שם העסק"
              required
              value={data.businessName}
              onChange={(e) => updateData({ businessName: e.target.value })}
              error={errors.businessName}
              containerClassName="w-full min-w-0"
              className="auth-input"
              labelClassName="auth-label"
              labelPlacement="above"
            />
          </div>

          <div className="auth-field">
            <Label htmlFor="businessType" className="auth-label text-right">
              סוג העסק <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Select
              value={data.businessType}
              onValueChange={(value) => updateData({ businessType: value as typeof data.businessType })}
            >
              <SelectTrigger 
                id="businessType"
                variant="underline"
                className={errors.businessType ? "auth-input border-danger focus:border-danger" : "auth-input"}
              >
                <SelectValue placeholder="בחר סוג עסק" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.businessType && (
              <p className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.businessType}
              </p>
            )}
          </div>

          <div className="auth-field">
            <FloatingInput
              label="מספר חברה / תעודת זהות"
              id="companyNumber"
              placeholder="123456789"
              required
              value={data.companyNumber}
              onChange={(e) => updateData({ companyNumber: e.target.value })}
              dir="ltr"
              className="auth-input text-left"
              labelClassName="auth-label"
              labelPlacement="above"
              error={errors.companyNumber}
              containerClassName="w-full min-w-0"
            />
          </div>

          <div className="auth-field">
            <Label htmlFor="industry" className="auth-label text-right">
              תחום פעילות
            </Label>
            <Select
              value={data.industry ? data.industry : undefined}
              onValueChange={(value) => updateData({ industry: value, customIndustry: "" })}
            >
              <SelectTrigger id="industry" variant="underline" className="auth-input">
                <SelectValue placeholder="בחר תחום פעילות (אופציונלי)" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
              אופציונלי — ניתן להמשיך גם ללא בחירה
            </p>
          </div>

          <div className="flex gap-3">
            <Button 
              type="button" 
              onClick={prevStep} 
              variant="secondary"
              className="flex-1"
              disabled={isLoading}
            >
              חזור
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              className="flex-1 auth-primary-button"
              disabled={isLoading}
              loading={isLoading}
            >
              אישור
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
