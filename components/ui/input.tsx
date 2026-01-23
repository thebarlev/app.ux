import React from "react";
import { cn } from "@/lib/utils";

// Standard field height: exactly 50px
export const FIELD_HEIGHT_CLASS = "h-[50px]";
export const FIELD_BASE_CLASS = "w-full  h-[50px] rounded-[0px] px-[15px] text-[14px] text-[#19183B] outline-none focus:ring-2 focus:ring-[#708993] focus:ring-offset-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-right";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className = "",
    type = "text",
    style,
    ...props
  },
  ref
) {
  const id = props.id;
  const usesUnderline = className.includes("border-b");

  return (
    <input
      type={type}
      ref={ref}
      className={cn(FIELD_BASE_CLASS, className)}
      style={{
        fontSize: "var(--field-input-text-size)",
        /* אין "קונטור צבע" - border שקוף כדי לא לקפוץ בגובה */
        ...(usesUnderline
          ? null
          : {
              border: "1px solid transparent",
              backgroundColor: "#EDF1F5",
            }),
        ...style,
      }}
      {...props}
    />
  );
});
