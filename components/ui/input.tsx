import React from "react";

// Standard field height: exactly 50px
export const FIELD_HEIGHT_CLASS = "h-[50px]";
export const FIELD_BASE_CLASS = "w-full h-[50px] rounded-xl border border-white/10 bg-white/5 px-4 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-colors";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`${FIELD_BASE_CLASS} ${className}`}
      {...props}
    />
  );
}
