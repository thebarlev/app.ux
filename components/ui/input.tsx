import React from "react";
import { cn } from "@/lib/utils";

// Standard field height: exactly 60px
export const FIELD_HEIGHT_CLASS = "h-[60px]";
export const FIELD_BASE_CLASS = "w-full rounded-[0px] outline-none focus:ring-2 focus:ring-[#708993] focus:ring-offset-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-right";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "items" // variant for styling - items uses ti-items tokens
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className = "",
    type = "text",
    style,
    variant = "default",
    ...props
  },
  ref
) {
  const id = props.id;
  const usesUnderline = className.includes("border-b");
  const isTiItemsInput = className.includes("ti-items-input");
  const resolvedVariant = isTiItemsInput ? "items" : variant;

  return (
    <input
      type={type}
      ref={ref}
      className={cn(FIELD_BASE_CLASS, className)}
      style={
        resolvedVariant === "items"
          ? style // For items variant, use only custom styles (no field tokens)
          : {
              height: "var(--field-height)",
              fontSize: "var(--field-input-text-size)",
              color: "var(--field-text)",
              display: "flex",
              alignItems: "center",
              /* אין "קונטור צבע" - border שקוף כדי לא לקפוץ בגובה */
              ...(usesUnderline
                ? null
                : {
                    border: "1px solid var(--field-border)",
                    backgroundColor: "var(--field-bg)",
                  }),
              ...style,
            }
      }
      {...props}
    />
  );
});
