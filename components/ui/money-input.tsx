import { cn } from "@/lib/utils";
import {
  fieldBase,
  fieldStateBorders,
} from "@/components/ui/field-styles";

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

  const stateClasses = error ? fieldStateBorders.error : fieldStateBorders.default;

  
  return (
    <div className="relative" style={{ width: style?.width || '100%' }}>
      <input
        id={id}
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          fieldBase,
          "ui-no-spin h-[var(--field-money-height)] text-[length:var(--field-money-text-size)] px-[var(--field-padding-x)] pt-[var(--field-money-padding-top)] pb-[var(--field-money-padding-bottom)]",
          stateClasses,
          className
        )}
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
