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
                    "absolute top-4 h-0.5 -right-1/2 w-full transition-colors duration-300",
                    isCompleted ? "bg-primary" : "bg-muted"
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
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isCompleted && "bg-primary text-primary-fg shadow-ui hover:bg-primary-hover",
                  isCurrent && "bg-primary text-primary-fg shadow-ui-lg ring-2 ring-primary ring-offset-2 scale-110",
                  !isCompleted && !isCurrent && "bg-muted text-muted-fg",
                  isClickable && "cursor-pointer hover:scale-105",
                  !isClickable && !isCurrent && "cursor-not-allowed"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                ) : (
                  <span className="text-sm">{step.id}</span>
                )}
              </button>

              {/* Step Label */}
              <span
                className={cn(
                  "text-center text-xs font-medium transition-colors leading-tight px-1",
                  isCurrent && "text-primary font-semibold",
                  isCompleted && "text-fg",
                  !isCompleted && !isCurrent && "text-muted-fg"
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
