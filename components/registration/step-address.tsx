"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useRegistration } from "./registration-context"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
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
          industry: data.industry || data.customIndustry,
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
    <Card className="p-8">
      <CardContent className="p-0">
        <div className="mb-8">
          <h2 className="text-right mb-2">כתובת העסק</h2>
          <p className="text-right" style={{ color: 'var(--muted-fg)', fontSize: '16px' }}>היכן ממוקם העסק שלך</p>
        </div>

        {error && (
          <div 
            className="mb-6 p-4 rounded-[5px]" 
            role="alert" 
            aria-live="assertive"
            style={{ backgroundColor: 'rgba(155, 0, 3, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="street" className="text-right">
              רחוב ומספר <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Input
              id="street"
              type="text"
              className={errors.street ? "border-danger focus:ring-danger" : ""}
              placeholder="רחוב הרצל 1"
              value={data.street}
              onChange={(e) => updateData({ street: e.target.value })}
              disabled={isLoading}
            />
            {errors.street && (
              <p className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.street}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city" className="text-right">
                עיר <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
              </Label>
              <Input
                id="city"
                type="text"
                className={errors.city ? "border-danger focus:ring-danger" : ""}
                placeholder="תל אביב-יפו"
                value={data.city}
                onChange={(e) => updateData({ city: e.target.value })}
                disabled={isLoading}
              />
              {errors.city && (
                <p className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                  {errors.city}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="postalCode" className="text-right">
                מיקוד
              </Label>
              <Input
                id="postalCode"
                type="text"
                className="text-left"
                placeholder="1234567"
                value={data.postalCode}
                onChange={(e) => updateData({ postalCode: e.target.value })}
                dir="ltr"
                disabled={isLoading}
              />
            </div>
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
              className="flex-1"
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? "יוצר חשבון..." : "השלם הרשמה"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
