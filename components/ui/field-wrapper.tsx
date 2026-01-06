import { Label } from "./label"
import { HelperText } from "./helper-text"
import { cn } from "@/lib/utils"

interface FieldWrapperProps {
  label: string
  required?: boolean
  error?: string | null
  hint?: string
  children: React.ReactNode
  className?: string
  id?: string
}

/**
 * FieldWrapper Component
 * 
 * Provides consistent form field structure following Tailwind UI patterns:
 * - Persistent label above field (never placeholder-only)
 * - Required indicator (*)
 * - Error message with icon below field
 * - Optional hint text
 * - Proper ARIA attributes for accessibility
 * 
 * Usage:
 * <FieldWrapper label="Customer Name" required error={errors.name} hint="Full legal name">
 *   <Input id="name" aria-invalid={!!errors.name} aria-describedby="name-error" />
 * </FieldWrapper>
 */
export function FieldWrapper({ 
  label, 
  required, 
  error, 
  hint,
  children, 
  className = "",
  id
}: FieldWrapperProps) {
  const errorId = id ? `${id}-error` : undefined;
  const hintId = id ? `${id}-hint` : undefined;
  
  return (
    <div className={cn("w-[300px]", className)}>
      <Label 
        htmlFor={id}
        className="text-right"
        style={{ color: '#19183B' }}
      >
        {label}
        {required && (
          <span 
            className="mr-1" 
            style={{ color: '#19183B' }}
            aria-label="שדה חובה"
          >
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <HelperText id={hintId}>
          {hint}
        </HelperText>
      )}
      {error && (
        <HelperText id={errorId} error>
          {error}
        </HelperText>
      )}
    </div>
  )
}
