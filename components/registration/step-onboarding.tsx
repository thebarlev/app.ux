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

      // Log RAW error first to see actual structure
      console.error("🔴 RAW authError:", authError)
      console.error("🔴 STRING authError:", JSON.stringify(authError, null, 2))
      console.error("🔴 Signup response:", { authData, authError })

      if (authError) {
        const errorMsg = authError.message?.includes("already registered")
          ? "כתובת האימייל כבר רשומה במערכת. נסה להתחבר."
          : `שגיאת הרשמה: ${authError.message || "Unknown error"}`
        
        console.error("❌ Auth signup error details:", {
          message: authError.message || "NO_MESSAGE",
          code: authError.code || "NO_CODE",
          status: authError.status || "NO_STATUS",
          name: authError.name || "NO_NAME",
        })
        
        setError(errorMsg)
        setIsLoading(false)
        return
      }

      if (!authData.user) {
        console.error("No user returned from signup", { authData })
        setError("ההרשמה נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      console.log("User created successfully:", authData.user.id)

      // Wait a moment for auth session to be established
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Step 2: Create company record
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .insert({
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
        .select("id")
        .single()

      if (companyError) {
        console.error("Company creation error:", {
          message: companyError.message,
          code: companyError.code,
          details: companyError.details,
          hint: companyError.hint,
          user_id: authData.user.id,
        })
        setError(`שגיאה ביצירת חברה: ${companyError.message}`)
        setIsLoading(false)
        return
      }

      if (!companyData) {
        console.error("No company data returned")
        setError("שגיאה: לא נוצרה חברה")
        setIsLoading(false)
        return
      }

      console.log("Company created successfully:", companyData.id)

      // STEP 2: Verify user is still authenticated before creating company_members
      const { data: { user: currentUser }, error: getUserError } = await supabase.auth.getUser()
      
      console.log("🔍 Auth check before company_members insert:", {
        currentUserId: currentUser?.id,
        authDataUserId: authData.user.id,
        isAuthenticated: !!currentUser,
        getUserError: getUserError,
      })

      if (!currentUser) {
        console.error("❌ User is not authenticated during onboarding")
        setError("המשתמש אינו מחובר. נסה להתחבר מחדש.")
        setIsLoading(false)
        return
      }

      // Step 3: Create company_members record for tenant isolation
      // NOTE: RLS policy must allow: INSERT when user_id = auth.uid()
      console.log("📝 Attempting to insert company_members:", {
        company_id: companyData.id,
        user_id: authData.user.id,
        role: "owner",
        status: "active",
      })

      const { data: memberData, error: memberError } = await supabase
        .from("company_members")
        .insert({
          company_id: companyData.id,
          user_id: authData.user.id,
          role: "owner",
          status: "active",
        })
        .select()

      // STEP 1: Log the raw error object FIRST
      console.error("🔴 RAW memberError:", memberError)
      console.error("🔴 STRING memberError:", JSON.stringify(memberError, null, 2))
      console.error("🔴 Insert response:", { memberData, memberError })

      if (memberError) {
        // Enhanced error logging with all available fields
        const errorInfo = {
          message: memberError.message || "Unknown error",
          code: memberError.code || "NO_CODE",
          details: memberError.details || "NO_DETAILS",
          hint: memberError.hint || "NO_HINT",
          rawError: memberError,
        }
        console.error("❌ Company member creation error:", errorInfo)
        
        // Check if it's an RLS error
        if (memberError.code === "42501" || memberError.message?.includes("permission") || memberError.message?.includes("policy")) {
          console.error("🚨 RLS POLICY ERROR: company_members table is blocking INSERT")
          console.error("💡 Required policy: Allow INSERT into company_members when user_id = auth.uid()")
          setError("שגיאת הרשאות: אין הרשאה ליצור קישור לחברה. פנה למנהל המערכת.")
        } else {
          setError(`שגיאה ביצירת קישור לחברה: ${memberError.message || "Unknown error"}`)
        }
        
        setIsLoading(false)
        return
      }

      console.log("✅ Company member created successfully:", memberData)

      // Redirect to success page
      router.push("/register/success")
    } catch (err) {
      console.error("Unexpected registration error:", err)
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
      setIsLoading(false)
    }
  }

  return (
    <NeumorphicCard>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">שאלות אחרונות</h2>
        <p className="mt-1 text-sm text-slate-600">נתאים את השירות לצרכים שלך</p>
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
          <label className="text-sm font-medium text-slate-900">באילו שירותים אתה מעוניין?</label>
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
                    ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50",
                )}
              >
                {need.label}
              </button>
            ))}
          </div>
          {localErrors.accountingNeeds && <p className="text-xs text-red-600 font-medium">{localErrors.accountingNeeds}</p>}
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
