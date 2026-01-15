"use client"

import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface NeumorphicSelectProps {
  label?: string
  placeholder?: string
  value?: string
  onValueChange?: (value: string) => void
  options: { value: string; label: string }[]
  error?: string
}

export function NeumorphicSelect({ label, placeholder, value, onValueChange, options, error }: NeumorphicSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-sm font-medium text-right text-foreground">{label}</label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className={cn(
            "ui-dd-trigger",
            error && "border-danger",
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="ui-dd-content" {...({ dir: "rtl" } as any)} align="end">
          {options.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value} 
              className="ui-dd-item ui-dd-item-rtl"
            >
              <span className="ui-dd-item-label">{option.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  )
}
