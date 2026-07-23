"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRegistration } from "@/components/registration/registration-context"
import { StepProgress } from "@/components/registration/step-progress"
import { StepPersonalDetails } from "@/components/registration/step-personal-details"
import { StepBusinessProfile } from "@/components/registration/step-business-profile"
import { LoginVisualPanel } from "@/components/auth/LoginVisualPanel"
import Image from "next/image"
import Link from "next/link"

const STEPS = [
  { id: 1, label: "פרטים אישיים" },
  { id: 2, label: "פרופיל עסקי" },
]

/** Same marketing site as the login "back to site" link. */
const MARKETING_SITE_URL = "https://uxellent.com"

interface RegistrationFlowClientProps {
  legalTermsText: string
  marketingText: string
  requireLegalTermsRequired: boolean
  requireMarketingRequired: boolean
  basePath?: string
  afterCompleteRedirectTo?: string
  signOutBeforeRedirect?: boolean
  /**
   * "card" (default) is the original centred card layout. "split" is the
   * redesigned 50/50 product layout for /register. The registration logic,
   * context, steps and fields are identical for both — only the chrome differs.
   */
  variant?: "card" | "split"
}

export function RegistrationFlowClient({
  legalTermsText,
  marketingText,
  requireLegalTermsRequired,
  requireMarketingRequired,
  basePath,
  afterCompleteRedirectTo,
  signOutBeforeRedirect,
  variant = "card",
}: RegistrationFlowClientProps) {
  const { currentStep, setCurrentStep } = useRegistration()
  const bp = String(basePath || "").trim().replace(/\/+$/, "")
  const loginHref = `${bp}/login` || "/login"

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
            loginHref={loginHref}
          />
        )
      case 2:
        return (
          <StepBusinessProfile
            afterCompleteRedirectTo={afterCompleteRedirectTo || loginHref}
            signOutBeforeRedirect={typeof signOutBeforeRedirect === "boolean" ? signOutBeforeRedirect : true}
          />
        )
      default:
        return (
          <StepPersonalDetails
            legalTermsText={legalTermsText}
            marketingText={marketingText}
            requireLegalTermsRequired={requireLegalTermsRequired}
            requireMarketingRequired={requireMarketingRequired}
            loginHref={loginHref}
          />
        )
    }
  }, [
    currentStep,
    legalTermsText,
    marketingText,
    requireLegalTermsRequired,
    requireMarketingRequired,
    loginHref,
    afterCompleteRedirectTo,
    signOutBeforeRedirect,
  ])

  const stepBody = (
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
  )

  // ---- Redesigned split layout (product register) -------------------------
  if (variant === "split") {
    const activeLabel = STEPS.find((s) => s.id === currentStep)?.label ?? STEPS[0].label
    return (
      <div className="auth-scope login-split" dir="rtl">
        <a className="ls-back" href={MARKETING_SITE_URL}>
          <span className="ls-back-a" aria-hidden="true">
            →
          </span>
          חזרה לאתר
        </a>

        <div className="ls-split">
          <section className="ls-half ls-form-side">
            <div className="ls-form-col">
              <div className="ls-logo">
                <Image src="/brand/uxellent.svg" alt="Uxellent" width={165} height={44} priority />
              </div>

              <div className="ls-steps">
                <div className="ls-step-ind" aria-hidden="true">
                  <span className="ls-sdot ls-sdot-on" />
                  <span className={`ls-sbar ${currentStep >= 2 ? "ls-sbar-full" : ""}`}>
                    <i />
                  </span>
                  <span className={`ls-sdot ${currentStep >= 2 ? "ls-sdot-on" : ""}`} />
                </div>
                <div className="ls-step-lbl">
                  שלב <b>{currentStep}</b> מתוך 2 · {activeLabel}
                </div>
              </div>

              {stepBody}

              {currentStep === 1 && (
                <p className="ls-alt">
                  כבר יש לך חשבון?{" "}
                  <Link href={loginHref} className="ls-alt-link">
                    התחברות
                  </Link>
                </p>
              )}
            </div>
          </section>

          <section className="ls-half ls-visual-side">
            <LoginVisualPanel />
          </section>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[420px]">
      <div className="mb-10 flex justify-center">
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

        {stepBody}

        <div className="mt-6 pt-5">
          <p className="text-center">
            כבר יש לך חשבון?{" "}
            <Link href={loginHref} className="auth-link">
              התחברות לחשבון
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
