"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Input } from "./input"
import { Label } from "./label"
import { Plus } from "lucide-react"

// רשימת תחומי פעילות נפוצים
const COMMON_INDUSTRIES = [
  "קמעונאות",
  "מסעדנות",
  "הייטק",
  "שירותים מקצועיים",
  "חינוך",
  "בריאות",
  "נדל״ן",
  "בנייה",
  "תחבורה",
  "ייעוץ",
  "שיווק דיגיטלי",
  "שירותי פרסום",
  "עיצוב",
  "פיתוח תוכנה",
  "חשבונאות",
  "משפטים",
  "רפואה אלטרנטיבית",
  "כושר וספורט",
  "יופי וטיפוח",
  "אירועים",
]

export interface BusinessActivityFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onCustomValue?: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  label?: string
  helperText?: string
  className?: string
}

export function BusinessActivityField({
  id = "business-activity",
  value,
  onChange,
  onCustomValue,
  error,
  required = false,
  disabled = false,
  placeholder = "התחל להקליד תחום פעילות…",
  label = "תחום פעילות",
  helperText = "התחל להקליד או בחר מהרשימה",
  className,
}: BusinessActivityFieldProps) {
  const [inputValue, setInputValue] = useState(value || "")
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [showAddNew, setShowAddNew] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // עדכון inputValue כש-value משתנה מבחוץ
  useEffect(() => {
    setInputValue(value || "")
  }, [value])

  // סינון הצעות בזמן הקלדה
  useEffect(() => {
    if (!inputValue.trim()) {
      // אם השדה ריק, הצג את כל ההצעות הנפוצות
      setFilteredSuggestions(COMMON_INDUSTRIES)
      setShowAddNew(false)
    } else {
      // סינון לפי טקסט
      const filtered = COMMON_INDUSTRIES.filter((industry) =>
        industry.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredSuggestions(filtered)
      
      // בדיקה אם יש התאמה מדויקת
      const exactMatch = COMMON_INDUSTRIES.some(
        (industry) => industry.toLowerCase() === inputValue.toLowerCase()
      )
      
      // הצג "הוסף חדש" רק אם אין התאמה מדויקת ויש טקסט
      setShowAddNew(!exactMatch && inputValue.trim().length > 0)
    }
    setShowSuggestions(true)
    setHighlightedIndex(-1)
  }, [inputValue])

  // סגירת הצעות בלחיצה מחוץ לקומפוננטה
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    // Clear error when user types
    if (error) {
      // Error clearing is handled by parent component
    }
  }

  const handleChipClick = (industry: string) => {
    setInputValue(industry)
    onChange(industry)
    setShowSuggestions(false)
    inputRef.current?.blur()
  }

  const handleAddNew = () => {
    if (inputValue.trim()) {
      onChange(inputValue.trim())
      if (onCustomValue) {
        onCustomValue(inputValue.trim())
      }
      setShowSuggestions(false)
      inputRef.current?.blur()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || filteredSuggestions.length === 0) {
      if (e.key === "Enter" && showAddNew && inputValue.trim()) {
        e.preventDefault()
        handleAddNew()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          handleChipClick(filteredSuggestions[highlightedIndex])
        } else if (showAddNew && inputValue.trim()) {
          handleAddNew()
        }
        break
      case "Escape":
        setShowSuggestions(false)
        inputRef.current?.blur()
        break
    }
  }

  const handleInputFocus = () => {
    setShowSuggestions(true)
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="space-y-2">
        {/* Input Field - Label is handled by parent */}
        <Input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={cn(
            error ? "border-danger focus:ring-danger" : "",
            "text-right"
          )}
        />

        {/* Helper Text */}
        {!error && helperText && (
          <p
            id={`${id}-hint`}
            className="text-xs"
            style={{ color: "var(--muted-fg)" }}
          >
            {helperText}
          </p>
        )}

        {/* Error Message */}
        {error && (
          <p
            id={`${id}-error`}
            className="text-sm mt-1"
            style={{ color: "var(--danger)" }}
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Suggestions Panel */}
        {showSuggestions && (filteredSuggestions.length > 0 || showAddNew) && (
          <div
            className="mt-3 p-4 rounded-[5px] border"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            {/* Chips - הצעות נפוצות */}
            {filteredSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {filteredSuggestions.map((industry, index) => {
                  const isHighlighted = index === highlightedIndex
                  const isSelected = industry === value
                  
                  return (
                    <button
                      key={industry}
                      type="button"
                      onClick={() => handleChipClick(industry)}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        isSelected
                          ? "text-white"
                          : isHighlighted
                          ? "opacity-90"
                          : ""
                      )}
                      style={{
                        backgroundColor: isSelected
                          ? "var(--primary)"
                          : isHighlighted
                          ? "var(--primary)"
                          : "var(--card)",
                        color: isSelected
                          ? "var(--primary-fg)"
                          : "var(--fg)",
                        border: isSelected
                          ? "none"
                          : `1px solid var(--border)`,
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {industry}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Add New Option */}
            {showAddNew && inputValue.trim() && (
              <button
                type="button"
                onClick={handleAddNew}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[5px]",
                  "text-sm font-medium transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "hover:underline"
                )}
                style={{
                  color: "var(--link)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={() => setHighlightedIndex(-1)}
              >
                <Plus className="h-4 w-4" />
                <span>הוסף תחום חדש: "{inputValue.trim()}"</span>
              </button>
            )}

            {/* Empty State */}
            {filteredSuggestions.length === 0 && !showAddNew && inputValue.trim() && (
              <p
                className="text-sm text-center py-2"
                style={{ color: "var(--muted-fg)" }}
              >
                לא מצאת תחום מתאים? הוסף חדש
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
