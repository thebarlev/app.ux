interface FieldWrapperProps {
  label: string
  required?: boolean
  error?: string | null
  children: React.ReactNode
  className?: string
}

export function FieldWrapper({ label, required, error, children, className = "" }: FieldWrapperProps) {
  return (
    <div className={className}>
      <label className="block mb-2 text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600 font-medium">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
