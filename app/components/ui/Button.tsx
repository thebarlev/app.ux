import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-fg hover:bg-primary-hover"
      : "bg-muted text-fg hover:bg-muted/80 border border-border";

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
