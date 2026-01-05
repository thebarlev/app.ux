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
    <div className={className}>
      <label 
        htmlFor={id}
        className="block mb-2 text-sm font-semibold text-white"
      >
        {label}
        {required && (
          <span 
            className="text-red-500 mr-1" 
            aria-label="שדה חובה"
          >
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p 
          id={hintId}
          className="mt-1.5 text-xs text-slate-400"
        >
          {hint}
        </p>
      )}
      {error && (
        <div 
          id={errorId}
          role="alert"
          className="mt-2 flex items-center gap-1.5 text-sm text-red-400 font-medium"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
