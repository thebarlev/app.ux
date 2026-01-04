"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicInput } from "./neumorphic-input"
import { NeumorphicButton } from "./neumorphic-button"
import { createClient } from "@/lib/supabase/client"

export function StepAddress() {
  const router = useRouter()
  const { data, updateData, prevStep, isLoading, setIsLoading, error, setError } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.street.trim()) newErrors.street = "שדה חובה"
    if (!data.city.trim()) newErrors.city = "שדה חובה"

    setErrors(newErrors)
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
        console.error("Auth signup error:", authError)
        
        // Handle specific error cases
        if (authError.message?.includes("already registered") || authError.message?.includes("User already registered")) {
          setError("כתובת האימייל כבר רשומה במערכת. אנא התחבר או השתמש באימייל אחר.")
        } else if (authError.message?.includes("email") && authError.message?.includes("invalid")) {
          setError("כתובת האימייל אינה תקינה")
        } else {
          setError(`שגיאה ביצירת חשבון: ${authError.message}`)
        }
        
        setIsLoading(false)
        return
      }

      if (!authData.user) {
        setError("שגיאה ביצירת משתמש")
        setIsLoading(false)
        return
      }

      console.log("✅ Auth user created:", authData.user.id)

      // Step 2: Create company record with required contact fields
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .insert({
          auth_user_id: authData.user.id,
          company_name: data.businessName,
          business_type: data.businessType,
          registration_number: data.companyNumber,
          address: `${data.street}, ${data.city}${data.postalCode ? ' ' + data.postalCode : ''}`,
          industry: data.industry === "other" ? data.customIndustry : data.industry,
          contact_first_name: data.firstName,
          contact_full_name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          mobile_phone: data.phone,
        })
        .select()
        .single()

      if (companyError) {
        console.error("Company creation error:", companyError)
        setError(`שגיאה ביצירת חברה: ${companyError.message}`)
        setIsLoading(false)
        return
      }

      console.log("✅ Company created:", companyData.id)

      // Step 3: Create company member (owner role) - without status column
      const { data: memberData, error: memberError } = await supabase
        .from("company_members")
        .insert({
          company_id: companyData.id,
          user_id: authData.user.id,
          role: "owner",
        })
        .select()

      if (memberError) {
        console.error("Company member creation error:", memberError)
        setError(`שגיאה ביצירת קישור לחברה: ${memberError.message}`)
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
    <div className="ui-card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ui-text">כתובת העסק</h2>
        <p className="mt-2 ui-text-muted">היכן ממוקם העסק שלך</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="street" className="ui-label">
            רחוב ומספר
          </label>
          <input
            id="street"
            type="text"
            className={errors.street ? "ui-input-error" : "ui-input"}
            placeholder="רחוב הרצל 1"
            value={data.street}
            onChange={(e) => updateData({ street: e.target.value })}
            disabled={isLoading}
          />
          {errors.street && <p className="text-sm text-ui-danger mt-1">{errors.street}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="city" className="ui-label">
              עיר
            </label>
            <input
              id="city"
              type="text"
              className={errors.city ? "ui-input-error" : "ui-input"}
              placeholder="תל אביב-יפו"
              value={data.city}
              onChange={(e) => updateData({ city: e.target.value })}
              disabled={isLoading}
            />
            {errors.city && <p className="text-sm text-ui-danger mt-1">{errors.city}</p>}
          </div>

          <div>
            <label htmlFor="postalCode" className="ui-label">
              מיקוד
            </label>
            <input
              id="postalCode"
              type="text"
              className="ui-input text-left"
              placeholder="1234567"
              value={data.postalCode}
              onChange={(e) => updateData({ postalCode: e.target.value })}
              dir="ltr"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            type="button" 
            onClick={prevStep} 
            className="ui-button-secondary flex-1"
            disabled={isLoading}
          >
            חזור לשלב הקודם
          </button>
          <button 
            type="submit" 
            className="ui-button-primary flex-1"
            disabled={isLoading}
          >
            {isLoading ? "יוצר חשבון..." : "השלם הרשמה"}
          </button>
        </div>
      </form>
    </div>
  )
}
