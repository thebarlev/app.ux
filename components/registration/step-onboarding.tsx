"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicSelect } from "./neumorphic-select"
import { NeumorphicButton } from "./neumorphic-button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const HOW_DID_YOU_HEAR = [
  { value: "google", label: "חיפוש בגוגל" },
  { value: "friend", label: "המלצת חבר" },
  { value: "social", label: "רשתות חברתיות" },
  { value: "accountant", label: "רואה חשבון" },
  { value: "other", label: "אחר" },
]

const ACCOUNTING_NEEDS = [
  { value: "bookkeeping", label: "הנהלת חשבונות" },
  { value: "tax", label: "דוחות מס" },
  { value: "payroll", label: "שכר ומשכורות" },
  { value: "invoicing", label: "הפקת חשבוניות" },
  { value: "consulting", label: "ייעוץ עסקי" },
]

const MONTHLY_DOCUMENTS = [
  { value: "0-20", label: "עד 20 מסמכים" },
  { value: "20-50", label: "20-50 מסמכים" },
  { value: "50-100", label: "50-100 מסמכים" },
  { value: "100+", label: "מעל 100 מסמכים" },
]

export function StepOnboarding() {
  const router = useRouter()
  const { data, updateData, prevStep, isLoading, setIsLoading, error, setError } = useRegistration()
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const toggleNeed = (value: string) => {
    const current = data.accountingNeeds
    const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    updateData({ accountingNeeds: updated })
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.howDidYouHear) newErrors.howDidYouHear = "שדה חובה"
    if (data.accountingNeeds.length === 0) newErrors.accountingNeeds = "בחר לפחות אפשרות אחת"
    if (!data.monthlyDocuments) newErrors.monthlyDocuments = "שדה חובה"

    setLocalErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/app`,
          data: {
            first_name: data.firstName,
            last_name: data.lastName,
          },
        },
      })

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError("כתובת האימייל כבר רשומה במערכת. נסה להתחבר.")
        } else {
          setError(authError.message)
        }
        setIsLoading(false)
        return
      }

      if (!authData.user) {
        setError("ההרשמה נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      // Step 2: Create company record
      const { error: companyError } = await supabase.from("companies").insert({
        company_name: data.businessName,
        business_type: data.businessType,
        company_number: data.companyNumber || null,
        industry: data.industry || null,
        custom_industry: data.customIndustry || null,
        street: data.street || null,
        city: data.city || null,
        postal_code: data.postalCode || null,
        contact_first_name: data.firstName,
        contact_full_name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        mobile_phone: data.phone || null,
        auth_user_id: authData.user.id,
        status: "active",
      })

      if (companyError) {
        console.error("Company creation error:", companyError)
        setError(`שגיאה ביצירת חברה: ${companyError.message || JSON.stringify(companyError)}`)
        setIsLoading(false)
        return
      }

      // Redirect to success page
      router.push("/register/success")
    } catch (err) {
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <NeumorphicCard>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">שאלות אחרונות</h2>
        <p className="mt-1 text-sm text-muted-foreground">נתאים את השירות לצרכים שלך</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <NeumorphicSelect
          label="איך הגעת אלינו?"
          placeholder="בחר אפשרות"
          value={data.howDidYouHear}
          onValueChange={(value) => updateData({ howDidYouHear: value })}
          options={HOW_DID_YOU_HEAR}
          error={localErrors.howDidYouHear}
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">באילו שירותים אתה מעוניין?</label>
          <div className="flex flex-wrap gap-2">
            {ACCOUNTING_NEEDS.map((need) => (
              <button
                key={need.value}
                type="button"
                onClick={() => toggleNeed(need.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm transition-all duration-200",
                  "border",
                  data.accountingNeeds.includes(need.value)
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50",
                )}
              >
                {need.label}
              </button>
            ))}
          </div>
          {localErrors.accountingNeeds && <p className="text-xs text-destructive">{localErrors.accountingNeeds}</p>}
        </div>

        <NeumorphicSelect
          label="כמה מסמכים בחודש (בערך)?"
          placeholder="בחר טווח"
          value={data.monthlyDocuments}
          onValueChange={(value) => updateData({ monthlyDocuments: value })}
          options={MONTHLY_DOCUMENTS}
          error={localErrors.monthlyDocuments}
        />

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>}

        <div className="flex gap-3 mt-2">
          <NeumorphicButton type="button" variant="secondary" onClick={prevStep} disabled={isLoading}>
            חזור
          </NeumorphicButton>
          <NeumorphicButton type="submit" isLoading={isLoading}>
            סיום הרשמה
          </NeumorphicButton>
        </div>
      </form>
    </NeumorphicCard>
  )
}
