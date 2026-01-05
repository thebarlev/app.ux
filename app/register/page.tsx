"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RegistrationProvider, useRegistration } from "@/components/registration/registration-context"
import { StepProgress } from "@/components/registration/step-progress"
import { StepPersonalDetails } from "@/components/registration/step-personal-details"
import { StepBusinessProfile } from "@/components/registration/step-business-profile"
import { StepAddress } from "@/components/registration/step-address"
import { RegistrationLogo } from "@/components/registration/registration-logo"
import Link from "next/link"

const STEPS = [
  { id: 1, label: "פרטים אישיים" },
  { id: 2, label: "פרופיל עסקי" },
  { id: 3, label: "כתובת" },
]

function RegistrationFlow() {
  const { currentStep, setCurrentStep } = useRegistration()

  const handleStepChange = (stepId: number) => {
    setCurrentStep(stepId)
  }

  const renderStep = useCallback(() => {
    switch (currentStep) {
      case 1:
        return <StepPersonalDetails />
      case 2:
        return <StepBusinessProfile />
      case 3:
        return <StepAddress />
      default:
        return <StepPersonalDetails />
    }
  }, [currentStep])

  return (
    <div className="min-h-svh w-full flex flex-col items-center justify-center bg-ui-bg px-4 py-8" dir="rtl">
      <div className="w-full max-w-[540px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <RegistrationLogo />
        </div>

        {/* Enhanced Stepper - with clickable navigation */}
        <div className="mb-8">
          <StepProgress 
            steps={STEPS} 
            currentStep={currentStep}
            onStepClick={handleStepChange}
            allowBackNavigation={true}
          />
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Sign In Link */}
        <p className="mt-6 text-center ui-text-muted">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="text-ui-primary hover:text-ui-primary-hover font-semibold transition-colors">
            התחברות לחשבון
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <RegistrationProvider>
      <RegistrationFlow />
    </RegistrationProvider>
  )
}
