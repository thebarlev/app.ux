"use client"

import type React from "react"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface NeumorphicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary"
  isLoading?: boolean
}

export const NeumorphicButton = forwardRef<HTMLButtonElement, NeumorphicButtonProps>(
  ({ className, variant = "primary", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "h-11 w-full rounded-xl px-6 text-sm font-medium",
          "transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "primary" ? cn(
            "bg-primary text-primary-foreground",
            "shadow-[4px_4px_12px_rgba(0,0,0,0.1),-2px_-2px_8px_rgba(255,255,255,0.3)]",
            "hover:shadow-[2px_2px_8px_rgba(0,0,0,0.12),-1px_-1px_4px_rgba(255,255,255,0.2)]",
            "active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.15)]"
          ) : cn(
            "bg-secondary text-secondary-foreground",
            "border border-border/50",
            "shadow-[4px_4px_12px_rgba(0,0,0,0.04),-2px_-2px_8px_rgba(255,255,255,0.5)]",
            "hover:bg-secondary/80"
          ),
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>טוען...</span>
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)

NeumorphicButton.displayName = "NeumorphicButton"
