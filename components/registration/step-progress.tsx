"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  id: number
  label: string
}

interface StepProgressProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (stepId: number) => void
  allowBackNavigation?: boolean
}

export function StepProgress({ 
  steps, 
  currentStep,
  onStepClick,
  allowBackNavigation = true 
}: StepProgressProps) {
  const handleStepClick = (stepId: number) => {
    // Allow backwards navigation always, forward only to current step
    if (allowBackNavigation && stepId < currentStep) {
      onStepClick?.(stepId)
    } else if (stepId === currentStep) {
      onStepClick?.(stepId)
    }
  }

  return (
    <nav aria-label="התקדמות ההרשמה" className="w-full">
      <ol className="flex items-start justify-between">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep
          const isCurrent = step.id === currentStep
          const isClickable = allowBackNavigation && step.id < currentStep

          return (
            <li key={step.id} className="flex flex-col items-center gap-2 flex-1 relative">
              {/* Connector Line (before step, except first) */}
              {index > 0 && (
                <div
                  className={cn(
                    "absolute top-5 sm:top-6 h-0.5 -right-1/2 w-full transition-colors duration-300",
                    isCompleted ? "bg-ui-primary" : "bg-ui-muted"
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Step Circle */}
              <button
                type="button"
                onClick={() => handleStepClick(step.id)}
                disabled={!isClickable && !isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${step.label}${isCompleted ? ' - הושלם' : isCurrent ? ' - שלב נוכחי' : ' - לא הושלם'}`}
                className={cn(
                  "relative z-10 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-primary focus-visible:ring-offset-2",
                  isCompleted && "bg-ui-primary text-white shadow-md hover:bg-ui-primary-hover",
                  isCurrent && "bg-ui-primary text-white shadow-lg ring-2 ring-ui-primary ring-offset-2 scale-110",
                  !isCompleted && !isCurrent && "bg-ui-muted text-ui-text-muted",
                  isClickable && "cursor-pointer hover:scale-105",
                  !isClickable && !isCurrent && "cursor-not-allowed"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} aria-hidden="true" />
                ) : (
                  <span className="text-base sm:text-lg">{step.id}</span>
                )}
              </button>

              {/* Step Label - 2 words max */}
              <span
                className={cn(
                  "text-center text-xs sm:text-sm font-medium transition-colors leading-tight px-1",
                  isCurrent && "text-ui-primary font-semibold",
                  isCompleted && "text-ui-text",
                  !isCompleted && !isCurrent && "text-ui-text-muted"
                )}
                aria-hidden="true"
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
