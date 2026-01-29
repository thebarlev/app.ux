"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRegistration } from "@/components/registration/registration-context"
import { StepProgress } from "@/components/registration/step-progress"
import { StepPersonalDetails } from "@/components/registration/step-personal-details"
import { StepBusinessProfile } from "@/components/registration/step-business-profile"
import Image from "next/image"
import Link from "next/link"

const STEPS = [
  { id: 1, label: "פרטים אישיים" },
  { id: 2, label: "פרופיל עסקי" },
]

interface RegistrationFlowClientProps {
  legalTermsText: string
  marketingText: string
  requireLegalTermsRequired: boolean
  requireMarketingRequired: boolean
}

export function RegistrationFlowClient({ 
  legalTermsText, 
  marketingText,
  requireLegalTermsRequired,
  requireMarketingRequired,
}: RegistrationFlowClientProps) {
  const { currentStep, setCurrentStep } = useRegistration()

  const handleStepChange = (stepId: number) => {
    setCurrentStep(stepId)
  }

  const renderStep = useCallback(() => {
    switch (currentStep) {
      case 1:
        return (
          <StepPersonalDetails 
            legalTermsText={legalTermsText} 
            marketingText={marketingText}
            requireLegalTermsRequired={requireLegalTermsRequired}
            requireMarketingRequired={requireMarketingRequired}
          />
        )
      case 2:
        return <StepBusinessProfile />
      default:
        return (
          <StepPersonalDetails 
            legalTermsText={legalTermsText} 
            marketingText={marketingText}
            requireLegalTermsRequired={requireLegalTermsRequired}
            requireMarketingRequired={requireMarketingRequired}
          />
        )
    }
  }, [currentStep, legalTermsText, marketingText, requireLegalTermsRequired, requireMarketingRequired])

  return (
    <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="mb-[70px] -mt-[-30px] flex justify-center">
          <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
        </div>

        <div className="mb-8">
          <StepProgress
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={handleStepChange}
            allowBackNavigation={true}
          />
        </div>

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

        <div className="mt-6 pt-5">
          <p className="text-center">
            כבר יש לך חשבון?{" "}
            <Link href="/login" className="auth-link">
              התחברות לחשבון
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
