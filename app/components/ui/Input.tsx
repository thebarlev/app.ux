import React from "react";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-fg placeholder:text-muted-fg outline-none focus:border-primary focus:ring-2 focus:ring-ring ${className}`}
      {...props}
    />
  );
}
