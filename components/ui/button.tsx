import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export function buttonVariants(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const variant = opts?.variant ?? "default";
  const size = opts?.size ?? "default";

  const base =
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<ButtonVariant, string> = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white/10 text-white hover:bg-white/15 border border-white/10",
    outline: "border border-white/15 bg-transparent text-white hover:bg-white/10",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    ghost: "bg-transparent text-white hover:bg-white/10",
    link: "bg-transparent text-blue-300 underline-offset-4 hover:underline",
  };

  const sizes: Record<ButtonSize, string> = {
    default: "h-10 px-4 py-2",
    sm: "h-9 px-3",
    lg: "h-11 px-6",
    icon: "h-10 w-10",
  };

  return cn(base, variants[variant], sizes[size], opts?.className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
