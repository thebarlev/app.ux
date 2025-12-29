"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RegistrationProvider, useRegistration } from "@/components/registration/registration-context"
import { StepProgress } from "@/components/registration/step-progress"
import { StepPersonalDetails } from "@/components/registration/step-personal-details"
import { StepBusinessProfile } from "@/components/registration/step-business-profile"
import { StepAddress } from "@/components/registration/step-address"
import { StepOnboarding } from "@/components/registration/step-onboarding"
import { RegistrationLogo } from "@/components/registration/registration-logo"
import Link from "next/link"

const STEPS = [
  { id: 1, label: "פרטים אישיים" },
  { id: 2, label: "פרופיל עסקי" },
  { id: 3, label: "כתובת" },
  { id: 4, label: "שאלות" },
]

function RegistrationFlow() {
  const { currentStep } = useRegistration()

  const renderStep = useCallback(() => {
    switch (currentStep) {
      case 1:
        return <StepPersonalDetails />
      case 2:
        return <StepBusinessProfile />
      case 3:
        return <StepAddress />
      case 4:
        return <StepOnboarding />
      default:
        return <StepPersonalDetails />
    }
  }, [currentStep])

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8 md:px-8">
      <div className="w-full max-w-[520px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <RegistrationLogo />
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <StepProgress steps={STEPS} currentStep={currentStep} />
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
        <p className="mt-8 text-center text-sm text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            התחברות
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
