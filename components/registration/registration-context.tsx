"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export interface RegistrationData {
  // Step 1: Personal Details
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  // Step 2: Business Profile
  businessName: string
  businessType: "osek_patur" | "osek_murshe" | "ltd" | "partnership" | ""
  companyNumber: string // מספר חברה / תעודת זהות (חובה)
  industry: string
  customIndustry: string // תחום פעילות מותאם אישית (אם בחר "אחר")
  // Step 3: Address
  street: string
  city: string // שדה טקסט חופשי
  postalCode: string
  // Step 4: Onboarding
  howDidYouHear: string
  accountingNeeds: string[]
  monthlyDocuments: string
}

interface RegistrationContextType {
  currentStep: number
  data: RegistrationData
  setCurrentStep: (step: number) => void
  updateData: (updates: Partial<RegistrationData>) => void
  nextStep: () => void
  prevStep: () => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
}

const initialData: RegistrationData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  businessName: "",
  businessType: "",
  companyNumber: "",
  industry: "",
  customIndustry: "",
  street: "",
  city: "",
  postalCode: "",
  howDidYouHear: "",
  accountingNeeds: [],
  monthlyDocuments: "",
}

const RegistrationContext = createContext<RegistrationContextType | null>(null)

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<RegistrationData>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateData = useCallback((updates: Partial<RegistrationData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 4))
    setError(null)
  }, [])

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    setError(null)
  }, [])

  return (
    <RegistrationContext.Provider
      value={{
        currentStep,
        data,
        setCurrentStep,
        updateData,
        nextStep,
        prevStep,
        isLoading,
        setIsLoading,
        error,
        setError,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  )
}

export function useRegistration() {
  const context = useContext(RegistrationContext)
  if (!context) {
    throw new Error("useRegistration must be used within RegistrationProvider")
  }
  return context
}
