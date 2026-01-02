import { Input } from "./input"

interface MoneyInputProps {
  value: number
  onChange: (value: number) => void
  currency?: string
  error?: boolean
  className?: string
}

export function MoneyInput({ value, onChange, currency = "₪", error, className = "" }: MoneyInputProps) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`pr-10 ${error ? "border-red-500" : ""} ${className}`}
      />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
        {currency}
      </div>
    </div>
  )
}
