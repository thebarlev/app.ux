import React from "react";
import { cn } from "@/lib/utils";

// Standard field height: exactly 50px
export const FIELD_HEIGHT_CLASS = "h-[50px]";
export const FIELD_BASE_CLASS = "w-full h-[50px] rounded-[5px] bg-white px-4 text-[14px] text-[#19183B] outline-none focus:ring-2 focus:ring-[#708993] focus:ring-offset-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-right";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function Input({
  className = "",
  type = "text",
  style,
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      className={cn(FIELD_BASE_CLASS, className)}
      style={{
        /* אין "קונטור צבע" - border שקוף כדי לא לקפוץ בגובה */
        border: "1px solid transparent",
        ...style,
      }}
      {...props}
    />
  );
}
