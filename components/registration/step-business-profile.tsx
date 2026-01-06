"use client"

import type React from "react"
import { useState } from "react"
import { useRegistration } from "./registration-context"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { HelperText } from "@/components/ui/helper-text"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
  { value: "partnership", label: "שותפות" },
]

const INDUSTRIES = [
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
  const { data, updateData, nextStep, prevStep } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.businessName.trim()) newErrors.businessName = "שדה חובה"
    if (!data.businessType) newErrors.businessType = "שדה חובה"
    if (!data.companyNumber.trim()) newErrors.companyNumber = "שדה חובה"
    if (!data.industry) newErrors.industry = "שדה חובה"
    
    // אם בחר "אחר" - חובה למלא תחום פעילות מותאם אישית
    if (data.industry === "other" && !data.customIndustry.trim()) {
      newErrors.customIndustry = "שדה חובה כאשר בוחרים 'אחר'"
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
    <Card className="shadow-ui-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-card-fg text-right">
          פרופיל עסקי
        </CardTitle>
        <CardDescription className="text-muted-fg text-right">
          ספר לנו על העסק שלך
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-right">
              שם העסק <span className="text-danger" aria-label="שדה חובה">*</span>
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
              <HelperText error>{errors.businessName}</HelperText>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessType" className="text-right">
              סוג העסק <span className="text-danger" aria-label="שדה חובה">*</span>
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
              <HelperText error>{errors.businessType}</HelperText>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyNumber" className="text-right">
              מספר חברה / תעודת זהות <span className="text-danger" aria-label="שדה חובה">*</span>
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
              <HelperText error>{errors.companyNumber}</HelperText>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry" className="text-right">
              תחום פעילות <span className="text-danger" aria-label="שדה חובה">*</span>
            </Label>
            <Select
              value={data.industry}
              onValueChange={(value) => updateData({ industry: value })}
            >
              <SelectTrigger 
                id="industry"
                className={errors.industry ? "border-danger focus:ring-danger" : ""}
              >
                <SelectValue placeholder="בחר תחום" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.value} value={ind.value}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.industry && (
              <HelperText error>{errors.industry}</HelperText>
            )}
          </div>

          {data.industry === "other" && (
            <div className="space-y-2">
              <Label htmlFor="customIndustry" className="text-right">
                פרט תחום פעילות <span className="text-danger" aria-label="שדה חובה">*</span>
              </Label>
              <Input
                id="customIndustry"
                type="text"
                className={errors.customIndustry ? "border-danger focus:ring-danger" : ""}
                placeholder="הזן את תחום הפעילות שלך"
                value={data.customIndustry}
                onChange={(e) => updateData({ customIndustry: e.target.value })}
              />
              {errors.customIndustry && (
                <HelperText error>{errors.customIndustry}</HelperText>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button 
              type="button" 
              onClick={prevStep} 
              variant="secondary"
              className="flex-1"
            >
              חזור
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              className="flex-1"
            >
              המשך לשלב הבא
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
