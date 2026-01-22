"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link";
type ButtonSize = "default" | "sm" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function buttonVariants(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const variant = opts?.variant ?? "primary";
  const size = opts?.size ?? "default";

  const base =
    "inline-flex items-center justify-center whitespace-nowrap rounded-[5px] text-[18px] font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<ButtonVariant, string> = {
    primary: "text-white hover:opacity-100 active:opacity-100",
    secondary: "bg-[#EDF1F5] text-[#19183B] border border-[#1D868F] hover:bg-[#1D868F] hover:text-white active:bg-[#1D868F] active:text-white",
    danger: "bg-danger text-danger-fg hover:opacity-90 active:opacity-80",
    ghost: "bg-transparent text-fg hover:bg-muted active:bg-muted",
    link: "bg-transparent text-primary underline-offset-4 hover:underline",
  };

  const sizes: Record<ButtonSize, string> = {
    default: "h-[50px] px-5",
    sm: "h-9 px-3 text-xs",
    icon: "h-[50px] w-[50px]",
  };

  return cn(base, variants[variant], sizes[size], opts?.className);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", loading, children, disabled, style, ...props }, ref) => {
    const isPrimary = variant === "primary";
    const isSecondary = variant === "secondary";
    const isDanger = variant === "danger";
    const isUnderlineTrigger = className?.includes("ui-dd-trigger") || className?.includes("border-b");
    
    const baseStyle = isPrimary
      ? {
          backgroundColor: "#1D868F",
          color: "#FFFFFF",
          ...style,
        }
      : isSecondary
        ? (isUnderlineTrigger
            ? {
                ...style,
              }
            : {
                backgroundColor: "#EDF1F5",
                color: "#19183B",
                border: "1px solid #1D868F",
                ...style,
              })
        : isDanger
          ? {
              backgroundColor: "#9B0003",
              color: "#FFFFFF",
              ...style,
            }
          : style;

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={buttonVariants({ variant, size, className })}
        style={baseStyle}
        onMouseEnter={(e) => {
          if (isPrimary && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#19183B";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          } else if (isSecondary && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1D868F";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          } else if (isDanger && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#7A0002";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          }
        }}
        onMouseLeave={(e) => {
          if (isPrimary && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1D868F";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          } else if (isSecondary && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#EDF1F5";
            (e.currentTarget as HTMLButtonElement).style.color = "#19183B";
          } else if (isDanger && !disabled && !loading) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#9B0003";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          }
        }}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";
