"use client"

import * as React from 'react'
import { Input } from './input'

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void // YYYY-MM-DD format
}

/**
 * DateInput Component
 * 
 * Date input that displays and accepts DD/MM/YYYY format
 * while storing internally as YYYY-MM-DD for compatibility
 */
export function DateInput({ value, onChange, ...props }: DateInputProps) {
  // Convert YYYY-MM-DD to DD/MM/YYYY for display
  const formatToDisplay = (isoDate: string): string => {
    if (!isoDate) return ''
    const [year, month, day] = isoDate.split('-')
    if (!year || !month || !day) return ''
    return `${day}/${month}/${year}`
  }

  // Convert DD/MM/YYYY to YYYY-MM-DD for storage
  const formatToISO = (displayDate: string): string => {
    if (!displayDate) return ''
    const cleaned = displayDate.replace(/[^\d]/g, '')
    if (cleaned.length !== 8) return ''
    
    const day = cleaned.substring(0, 2)
    const month = cleaned.substring(2, 4)
    const year = cleaned.substring(4, 8)
    
    // Basic validation
    const dayNum = parseInt(day, 10)
    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)
    
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900) {
      return ''
    }
    
    return `${year}-${month}-${day}`
  }

  const [displayValue, setDisplayValue] = React.useState(formatToDisplay(value))

  // Sync display value when prop value changes
  React.useEffect(() => {
    setDisplayValue(formatToDisplay(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.replace(/[^\d]/g, '') // Remove non-digits
    
    // Limit to 8 digits
    if (input.length > 8) {
      input = input.substring(0, 8)
    }
    
    // Format as DD/MM/YYYY while typing
    let formatted = ''
    if (input.length > 0) {
      formatted = input.substring(0, 2) // DD
      if (input.length >= 3) {
        formatted += '/' + input.substring(2, 4) // MM
      }
      if (input.length >= 5) {
        formatted += '/' + input.substring(4, 8) // YYYY
      }
    }
    
    setDisplayValue(formatted)
    
    // Only call onChange when we have a complete date
    if (input.length === 8) {
      const isoDate = formatToISO(formatted)
      if (isoDate) {
        onChange(isoDate)
      }
    } else if (input.length === 0) {
      onChange('')
    }
  }

  const handleBlur = () => {
    // On blur, validate and reformat
    const cleaned = displayValue.replace(/[^\d]/g, '')
    if (cleaned.length === 8) {
      const isoDate = formatToISO(displayValue)
      if (isoDate) {
        onChange(isoDate)
        setDisplayValue(formatToDisplay(isoDate))
      }
    } else if (cleaned.length === 0) {
      setDisplayValue('')
      onChange('')
    }
  }

  return (
    <Input
      {...props}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="DD/MM/YYYY"
      maxLength={10}
      inputMode="numeric"
    />
  )
}
