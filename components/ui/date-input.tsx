"use client"

import * as React from 'react'
import { Input } from './input'
import { Calendar } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void // YYYY-MM-DD format
  min?: string // YYYY-MM-DD format - minimum allowed date
  max?: string // YYYY-MM-DD format - maximum allowed date
}

/**
 * DateInput Component
 * 
 * Date input that displays and accepts DD/MM/YYYY format
 * while storing internally as YYYY-MM-DD for compatibility
 * Supports min date restriction and calendar picker
 */
export function DateInput({ value, onChange, min, max, ...props }: DateInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
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

  const [displayValue, setDisplayValue] = React.useState('')
  const [isMounted, setIsMounted] = React.useState(false)

  // Sync display value when prop value changes
  React.useEffect(() => {
    setIsMounted(true)
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
        // Validate date parts
        const [year, month, day] = isoDate.split('-')
        const dayNum = parseInt(day, 10)
        const monthNum = parseInt(month, 10)
        const yearNum = parseInt(year, 10)
        
        // Check if date is valid
        const dateObj = new Date(yearNum, monthNum - 1, dayNum)
        const isValidDate = dateObj.getFullYear() === yearNum && 
                           dateObj.getMonth() === monthNum - 1 && 
                           dateObj.getDate() === dayNum
        
        if (!isValidDate) {
          // Invalid date, restore previous value
          setDisplayValue(formatToDisplay(value))
          return
        }
        
        // Validate against min date
        if (min && isoDate < min) {
          // Reset to min date if below minimum
          onChange(min)
          setDisplayValue(formatToDisplay(min))
          return
        }
        
        // Validate against max date
        if (max && isoDate > max) {
          // Reset to max date if above maximum
          onChange(max)
          setDisplayValue(formatToDisplay(max))
          return
        }
        
        onChange(isoDate)
        setDisplayValue(formatToDisplay(isoDate))
      } else {
        // Invalid format, restore previous value
        setDisplayValue(formatToDisplay(value))
      }
    } else if (cleaned.length > 0 && cleaned.length < 8) {
      // Partial date, restore previous value
      setDisplayValue(formatToDisplay(value))
    } else if (cleaned.length === 0) {
      setDisplayValue('')
      onChange('')
    }
  }

  // Validate date against min/max when typing
  const validateDate = (isoDate: string): boolean => {
    if (!isoDate) return true
    if (min && isoDate < min) return false
    if (max && isoDate > max) return false
    return true
  }

  // Handle manual editing - format as user types
  const handleChangeWithValidation = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const cursorPosition = e.target.selectionStart || 0
    
    // Remove all non-digits
    let input = newValue.replace(/[^\d]/g, '')
    
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
    
    // Update cursor position after formatting
    setTimeout(() => {
      if (inputRef.current) {
        // Calculate new cursor position accounting for slashes
        const digitsBeforeCursor = newValue.substring(0, cursorPosition).replace(/[^\d]/g, '').length
        let newCursorPos = 0
        let digitCount = 0
        
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++
            if (digitCount === digitsBeforeCursor) {
              newCursorPos = i + 1
              break
            }
          }
        }
        
        if (newCursorPos === 0) {
          newCursorPos = formatted.length
        }
        
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
    
    // Only call onChange when we have a complete date (8 digits)
    if (input.length === 8) {
      const isoDate = formatToISO(formatted)
      if (isoDate) {
        // Validate date parts
        const [year, month, day] = isoDate.split('-')
        const dayNum = parseInt(day, 10)
        const monthNum = parseInt(month, 10)
        const yearNum = parseInt(year, 10)
        
        // Check if date is valid
        const dateObj = new Date(yearNum, monthNum - 1, dayNum)
        const isValidDate = dateObj.getFullYear() === yearNum && 
                           dateObj.getMonth() === monthNum - 1 && 
                           dateObj.getDate() === dayNum
        
        if (isValidDate && validateDate(isoDate)) {
          onChange(isoDate)
        } else if (isValidDate && !validateDate(isoDate)) {
          // Date is outside allowed range
          if (min && isoDate < min) {
            onChange(min)
            setDisplayValue(formatToDisplay(min))
          } else if (max && isoDate > max) {
            onChange(max)
            setDisplayValue(formatToDisplay(max))
          }
        }
        // If invalid date, don't update - let blur handle it
      }
    } else if (input.length === 0) {
      onChange('')
    }
  }

  // Convert selected date to YYYY-MM-DD format
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined
  const minDate = min ? new Date(min + 'T00:00:00') : undefined
  const maxDate = max ? new Date(max + 'T00:00:00') : undefined

  const handleDaySelect = (date: Date | undefined) => {
    if (date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}`)
      // Don't close automatically - let user close manually or click outside
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Display input with DD/MM/YYYY format */}
        <Input
          {...props}
          ref={inputRef}
          type="text"
          value={isMounted ? displayValue : formatToDisplay(value)}
          onChange={handleChangeWithValidation}
          onBlur={handleBlur}
          onFocus={(e) => {
            // Allow normal editing - don't interfere with focus
            if (props.onFocus) {
              props.onFocus(e)
            }
          }}
          onClick={(e) => {
            // Click on input opens calendar (but allow text selection)
            const target = e.target as HTMLInputElement
            const selectionStart = target.selectionStart || 0
            const selectionEnd = target.selectionEnd || 0
            
            // Only open calendar if user clicked but didn't select text
            if (selectionStart === selectionEnd) {
              setOpen(true)
            }
            
            if (props.onClick) {
              props.onClick(e)
            }
          }}
          placeholder="DD/MM/YYYY"
          maxLength={10}
          inputMode="numeric"
          style={{ 
            paddingRight: '45px',
            ...props.style 
          }}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            style={{
              position: 'absolute',
              right: '15px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            aria-label="פתח לוח שנה"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
          >
            <Calendar size={20} style={{ color: '#708993' }} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={8} dir="rtl">
          <style jsx global>{`
            .rdp {
              --rdp-cell-size: 45px;
              --rdp-accent-color: #1D868F;
              --rdp-background-color: #EDF1F5;
              --rdp-accent-color-dark: #19183B;
              --rdp-background-color-dark: #EDF1F5;
              --rdp-outline: 2px solid var(--rdp-accent-color);
              --rdp-outline-selected: 2px solid var(--rdp-accent-color);
              margin: 0;
              font-family: 'Assistant', sans-serif;
            }
            .rdp-button_reset {
              appearance: none;
              position: relative;
              margin: 0;
              padding: 0;
              cursor: default;
              color: inherit;
              border: none;
              background-color: transparent;
              font: inherit;
            }
            .rdp-button {
              border: 1px solid transparent;
            }
            .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
              background-color: #C6EAE5;
              color: #19183B;
            }
            .rdp-day_selected,
            .rdp-day_selected:focus-visible,
            .rdp-day_selected:hover {
              background-color: #1D868F !important;
              color: #FFFFFF !important;
              font-weight: 600;
            }
            .rdp-day_today:not(.rdp-day_outside):not(.rdp-day_selected) {
              font-weight: 700;
              color: #1D868F !important;
            }
            .rdp-day_today.rdp-day_selected {
              background-color: #1D868F !important;
              color: #FFFFFF !important;
            }
            .rdp-day_disabled,
            .rdp-day_disabled:hover {
              opacity: 0.3;
              cursor: not-allowed;
            }
            .rdp-caption {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              font-size: 18px;
              font-weight: 600;
              color: #19183B;
            }
            .rdp-caption_label {
              margin: 0;
              padding: 0;
              font-size: 18px;
              font-weight: 600;
              color: #19183B;
            }
            .rdp-nav_button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              padding: 0;
              border-radius: 5px;
              background-color: transparent;
              cursor: pointer;
              transition: background-color 0.2s;
            }
            .rdp-nav_button,
            .rdp-nav_button *,
            .rdp-nav_button svg,
            .rdp-nav_button svg * {
              color: #1D868F !important;
              fill: #1D868F !important;
              stroke: #1D868F !important;
            }
            .rdp-nav_button:hover {
              background-color: #EDF1F5;
            }
            .rdp-nav_button:hover,
            .rdp-nav_button:hover *,
            .rdp-nav_button:hover svg,
            .rdp-nav_button:hover svg * {
              color: #1D868F !important;
              fill: #1D868F !important;
              stroke: #1D868F !important;
            }
            .rdp-head_cell {
              font-size: 16px;
              font-weight: 600;
              color: #708993;
              padding: 8px 0;
            }
            .rdp-cell {
              width: var(--rdp-cell-size);
              height: var(--rdp-cell-size);
            }
            .rdp-day {
              width: var(--rdp-cell-size);
              height: var(--rdp-cell-size);
              border-radius: 5px;
              font-size: 16px;
              color: #19183B;
            }
            .rdp-day_range_start,
            .rdp-day_range_end {
              background-color: #1D868F !important;
              color: #FFFFFF !important;
            }
          `}</style>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            disabled={
              minDate || maxDate
                ? {
                    ...(minDate ? { before: minDate } : {}),
                    ...(maxDate ? { after: maxDate } : {}),
                  }
                : undefined
            }
            dir="rtl"
            className="rounded-[20px] p-4"
            style={{
              backgroundColor: '#FFFFFF',
            }}
          />
        </PopoverContent>
      </div>
    </Popover>
  )
}
