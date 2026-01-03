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
    <div className="ui-card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ui-text">כתובת העסק</h2>
        <p className="mt-2 ui-text-muted">היכן ממוקם העסק שלך</p>
      </div>

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
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={prevStep} className="ui-button-secondary flex-1">
            חזור לשלב הקודם
          </button>
          <button type="submit" className="ui-button-primary flex-1">
            המשך לשלב הבא
          </button>
        </div>
      </form>
    </div>
  )
}
