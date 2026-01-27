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
  variant?: "default" | "items"
  className?: string
  style?: React.CSSProperties
  id?: string
  allowNegative?: boolean
  displayValue?: string
  readOnly?: boolean
  "aria-required"?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function MoneyInput({ 
  value, 
  onChange, 
  currency = "₪", 
  error, 
  variant = "default",
  className = "",
  style,
  id,
  allowNegative = false,
  displayValue,
  readOnly = false,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MoneyInputProps) {
  const fontSize = style?.fontSize || '18px'
  const fontWeight = style?.fontWeight || 'normal'

  const stateClasses =
    variant === "items"
      ? error
        ? "border-[color:var(--field-border-error)]"
        : "border-[color:var(--ti-items-row-border)]"
      : error
        ? fieldStateBorders.error
        : fieldStateBorders.default;

  return (
    <div className="relative" style={{ width: style?.width || '100%' }}>
      <input
        id={id}
        type={displayValue ? "text" : "number"}
        min={allowNegative ? undefined : 0}
        step="0.01"
        value={displayValue ?? value}
        onChange={(e) => {
          if (displayValue || readOnly) return;
          onChange(Number(e.target.value));
        }}
        className={cn(
          variant === "items"
            ? "ti-items-money ui-no-spin w-full min-w-0 text-right"
            : fieldBase,
          variant === "items"
            ? ""
            : "ui-no-spin h-[var(--field-money-height)] text-[length:var(--field-money-text-size)] px-[var(--field-padding-x)] pt-[var(--field-money-padding-top)] pb-[var(--field-money-padding-bottom)]",
          stateClasses,
          className
        )}
        style={{
          ...style,
          fontSize: typeof fontSize === 'string' ? fontSize : `${fontSize}px`,
          fontWeight: typeof fontWeight === 'string' ? fontWeight : `${fontWeight}`,
        }}
        readOnly={readOnly}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
    </div>
  )
}
