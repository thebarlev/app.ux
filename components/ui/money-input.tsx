import { Input } from "./input"

interface MoneyInputProps {
  value: number
  onChange: (value: number) => void
  currency?: string
  error?: boolean
  className?: string
  style?: React.CSSProperties
  id?: string
  "aria-required"?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function MoneyInput({ 
  value, 
  onChange, 
  currency = "₪", 
  error, 
  className = "",
  style,
  id,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MoneyInputProps) {
  const fontSize = style?.fontSize || '18px'
  const fontWeight = style?.fontWeight || 'normal'
  
  return (
    <div className="relative" style={{ width: style?.width || '100%' }}>
      <Input
        id={id}
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${error ? "border-red-500" : ""} ${className}`}
        style={{
          ...style,
          fontSize: typeof fontSize === 'string' ? fontSize : `${fontSize}px`,
          fontWeight: typeof fontWeight === 'string' ? fontWeight : `${fontWeight}`,
        }}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
    </div>
  )
}
