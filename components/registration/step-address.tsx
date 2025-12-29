"use client"

import type React from "react"

import { useState } from "react"
import { useRegistration } from "./registration-context"
import { NeumorphicCard } from "./neumorphic-card"
import { NeumorphicInput } from "./neumorphic-input"
import { NeumorphicButton } from "./neumorphic-button"

export function StepAddress() {
  const { data, updateData, nextStep, prevStep } = useRegistration()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!data.street.trim()) newErrors.street = "שדה חובה"
    if (!data.city.trim()) newErrors.city = "שדה חובה"

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
    <NeumorphicCard>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">כתובת העסק</h2>
        <p className="mt-1 text-sm text-muted-foreground">היכן ממוקם העסק שלך</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <NeumorphicInput
          id="street"
          label="רחוב ומספר"
          placeholder="רחוב הרצל 1"
          value={data.street}
          onChange={(e) => updateData({ street: e.target.value })}
          error={errors.street}
        />

        <div className="grid grid-cols-2 gap-4">
          <NeumorphicInput
            id="city"
            label="עיר"
            placeholder="תל אביב-יפו"
            value={data.city}
            onChange={(e) => updateData({ city: e.target.value })}
            error={errors.city}
          />

          <NeumorphicInput
            id="postalCode"
            label="מיקוד"
            placeholder="1234567"
            value={data.postalCode}
            onChange={(e) => updateData({ postalCode: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>

        <div className="flex gap-3 mt-2">
          <NeumorphicButton type="button" variant="secondary" onClick={prevStep}>
            חזור
          </NeumorphicButton>
          <NeumorphicButton type="submit">המשך</NeumorphicButton>
        </div>
      </form>
    </NeumorphicCard>
  )
}
