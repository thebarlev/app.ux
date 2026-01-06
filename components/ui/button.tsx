import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link" | "default" | "outline" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  isLoading?: boolean;
  asChild?: boolean;
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
    destructive: "bg-danger text-danger-fg hover:opacity-90 active:opacity-80",
    default: "text-white hover:opacity-100 active:opacity-100",
    outline: "bg-[#EDF1F5] text-[#19183B] border border-[#1D868F] hover:bg-[#1D868F] hover:text-white active:bg-[#1D868F] active:text-white",
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
  ({ className, variant = "primary", size = "default", loading, isLoading, asChild = false, children, disabled, style, ...props }, ref) => {
    // Map "default" to "primary" and "outline" to "secondary" for styling
    const effectiveVariant = variant === "default" ? "primary" : variant === "outline" ? "secondary" : variant === "destructive" ? "danger" : variant;
    const isPrimary = effectiveVariant === "primary";
    const isSecondary = effectiveVariant === "secondary";
    const isDanger = effectiveVariant === "danger";
    const isActuallyLoading = loading || isLoading;
    
    const baseStyle = isPrimary ? {
      backgroundColor: "#1D868F",
      color: "#FFFFFF",
      ...style,
    } : isSecondary ? {
      backgroundColor: "#EDF1F5",
      color: "#19183B",
      border: "1px solid #1D868F",
      ...style,
    } : isDanger ? {
      backgroundColor: "#9B0003",
      color: "#FFFFFF",
      ...style,
    } : style;

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        disabled={disabled || isActuallyLoading}
        className={buttonVariants({ variant: effectiveVariant, size, className })}
        style={baseStyle}
        onMouseEnter={(e) => {
          if (isPrimary && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#19183B";
            (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
          } else if (isSecondary && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#1D868F";
            (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
          } else if (isDanger && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#7A0002";
            (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
          }
        }}
        onMouseLeave={(e) => {
          if (isPrimary && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#1D868F";
            (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
          } else if (isSecondary && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#EDF1F5";
            (e.currentTarget as HTMLElement).style.color = "#19183B";
          } else if (isDanger && !disabled && !isActuallyLoading) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#9B0003";
            (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
          }
        }}
        {...props}
      >
        {isActuallyLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";
