import * as React from "react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import {
  fieldBase,
  fieldSizes,
  fieldStateBorders,
  labelBase,
  labelStates,
  helperTextBase,
  helperTextError,
} from "@/components/ui/field-styles";

export interface FloatingDateInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  error?: string | null;
  helperText?: string;
  fieldSize?: "default" | "sm";
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
}

export function FloatingDateInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  required,
  error,
  helperText,
  fieldSize = "default",
  className,
  containerClassName,
  labelClassName,
}: FloatingDateInputProps) {
  const errorId = error ? `${id}-error` : undefined;
  const helperId = !error && helperText ? `${id}-help` : undefined;
  const describedBy = errorId ?? helperId;

  const stateClasses = error
    ? fieldStateBorders.error
    : fieldStateBorders.default;

  const labelStateClasses = error
    ? labelStates.error
    : labelStates.default;

  return (
      <div className={cn("relative w-full min-w-0 ui-field-block", containerClassName)}>
      <DateInput
        id={id}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={cn(
          fieldBase,
          fieldSizes[fieldSize].input,
          stateClasses,
          className
        )}
        placeholder=" "
        style={{ backgroundColor: "var(--field-bg)" }}
      />
      <label
        htmlFor={id}
        className={cn(
          labelBase,
          "peer-disabled:text-muted-fg",
          fieldSizes[fieldSize].label,
          "ui-date-label",
          "text-[length:var(--field-date-label-size)]",
          labelStateClasses,
          labelClassName
        )}
      >
        {label}
        {required && <span className="ms-1">*</span>}
      </label>
      {helperText && !error && (
        <p id={helperId} className={helperTextBase}>
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className={cn(helperTextBase, helperTextError)}>
          {error}
        </p>
      )}
    </div>
  );
}
