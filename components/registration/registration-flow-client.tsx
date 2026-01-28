"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRegistration } from "@/components/registration/registration-context"
import { StepProgress } from "@/components/registration/step-progress"
import { StepPersonalDetails } from "@/components/registration/step-personal-details"
import { StepBusinessProfile } from "@/components/registration/step-business-profile"
import { RegistrationLogo } from "@/components/registration/registration-logo"
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
    <div className="auth-shell min-h-svh w-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="auth-container w-full max-w-[600px] px-4">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <RegistrationLogo />
        </div>

        {/* Step Indicator */}
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
        <div className="auth-footer mt-8">
          <p className="auth-footnote text-center" style={{ color: 'var(--muted-fg)', fontSize: '14px' }}>
            כבר יש לך חשבון?{" "}
            <Link 
              href="/login" 
              className="auth-secondary-link font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-[5px]"
              style={{ color: 'var(--link)' }}
            >
              התחברות לחשבון
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
