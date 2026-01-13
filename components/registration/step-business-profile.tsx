"use client"

import type React from "react"
import { useState } from "react"
import { useRegistration } from "./registration-context"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BusinessActivityField } from "@/components/ui/business-activity-field"
import { createClient } from "@/lib/supabase/client"

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
  { value: "partnership", label: "שותפות" },
]

// Note: Industries are now handled by BusinessActivityField component
// This list is kept for backward compatibility if needed
const INDUSTRIES_LEGACY = [
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
  const router = useRouter()
  const { data, updateData, prevStep, isLoading, setIsLoading, error, setError } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.businessName.trim()) newErrors.businessName = "שדה חובה"
    if (!data.businessType) newErrors.businessType = "שדה חובה"
    if (!data.companyNumber.trim()) newErrors.companyNumber = "שדה חובה"
    if (!data.industry || !data.industry.trim()) newErrors.industry = "שדה חובה"

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

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/app`,
          data: { first_name: data.firstName, last_name: data.lastName },
        },
      })

      if (authError) {
        if (authError.message?.includes("already registered") || authError.message?.includes("User already registered")) {
          setError("כתובת האימייל כבר רשומה במערכת. נסה להתחבר.")
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

      const userId = authData.user.id

      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .insert({
          auth_user_id: userId,
          company_name: data.businessName,
          business_type: data.businessType,
          registration_number: data.companyNumber || null,
          industry: data.industry || null,
          custom_industry: data.customIndustry || null,
          contact_first_name: data.firstName,
          contact_full_name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          mobile_phone: data.phone || null,
        })
        .select("id")
        .single()

      if (companyError || !companyData?.id) {
        setError(`שגיאה ביצירת חברה: ${companyError?.message || "Unknown error"}`)
        setIsLoading(false)
        return
      }

      const { error: memberError } = await supabase.from("company_members").insert({
        company_id: companyData.id,
        user_id: userId,
        role: "owner",
      })

      if (memberError) {
        setError(`שגיאה ביצירת קישור לחברה: ${memberError.message}`)
        setIsLoading(false)
        return
      }

      router.push("/dashboard/settings")
      setIsLoading(false)
    } catch (err) {
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
      setIsLoading(false)
    }
  }

  return (
    <Card className="p-8">
      <CardContent className="p-0">
        <div className="mb-8">
          <h2 className="text-right mb-2">פרופיל עסקי</h2>
          <p className="text-right" style={{ color: 'var(--muted-fg)', fontSize: '16px' }}>ספר לנו על העסק שלך</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-right">
              שם העסק <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Input
              id="businessName"
              type="text"
              className={errors.businessName ? "border-danger focus:ring-danger" : ""}
              placeholder="שם העסק המלא"
              value={data.businessName}
              onChange={(e) => updateData({ businessName: e.target.value })}
            />
            {errors.businessName && (
              <p className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.businessName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessType" className="text-right">
              סוג העסק <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Select
              value={data.businessType}
              onValueChange={(value) => updateData({ businessType: value as typeof data.businessType })}
            >
              <SelectTrigger 
                id="businessType"
                className={errors.businessType ? "border-danger focus:ring-danger" : ""}
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

          <div className="space-y-2">
            <Label htmlFor="companyNumber" className="text-right">
              מספר חברה / תעודת זהות <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <Input
              id="companyNumber"
              type="text"
              className={`text-left ${errors.companyNumber ? "border-danger focus:ring-danger" : ""}`}
              placeholder="123456789"
              value={data.companyNumber}
              onChange={(e) => updateData({ companyNumber: e.target.value })}
              dir="ltr"
            />
            {errors.companyNumber && (
              <p className="text-sm mt-1" style={{ color: 'var(--danger)' }} role="alert">
                {errors.companyNumber}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry" className="text-right">
              תחום פעילות <span style={{ color: 'var(--danger)' }} aria-label="שדה חובה">*</span>
            </Label>
            <BusinessActivityField
              id="industry"
              value={data.industry || ""}
              onChange={(value) => {
                updateData({ industry: value, customIndustry: "" })
              }}
              onCustomValue={(value) => {
                // Mark as custom if not in common list
                updateData({ industry: value, customIndustry: value })
              }}
              error={errors.industry}
              required
              label="תחום פעילות"
              helperText="התחל להקליד או בחר מהרשימה"
            />
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
