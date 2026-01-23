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
      {label && <label className="text-sm font-medium text-slate-900">{label}</label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className={cn(
            "h-[50px] w-full rounded-xl px-4 text-[14px]",
            "bg-white text-slate-900 border border-slate-300",
            "shadow-sm",
            "focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500",
            "transition-all duration-200",
            "data-[placeholder]:text-slate-400",
            error && "border-red-500",
          )}
        >
          <SelectValue placeholder={placeholder} className="text-slate-900" />
        </SelectTrigger>
        <SelectContent className="bg-white border border-slate-300 rounded-xl shadow-xl z-50">
          {options.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value} 
              className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 rounded-lg cursor-pointer"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  )
}
