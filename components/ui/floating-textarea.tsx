import * as React from "react";
import { cn } from "@/lib/utils";
import {
  fieldBase,
  fieldStateBorders,
  labelBase,
  labelStates,
  helperTextBase,
  helperTextError,
} from "@/components/ui/field-styles";

export interface FloatingTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | null;
  helperText?: string;
  success?: boolean;
  fieldSize?: "default" | "sm";
  containerClassName?: string;
  labelClassName?: string;
}

const sizeStyles = {
  default: {
    textarea:
      "min-h-[120px] text-[18px] px-[var(--field-padding-x)] pt-[calc(var(--field-padding-y)+var(--field-text-offset))] pb-[var(--field-padding-y)]",
    label: "text-[length:var(--field-label-size)]",
  },
  sm: {
    textarea:
      "min-h-[100px] text-[16px] px-[var(--field-padding-x)] pt-[calc(var(--field-padding-y)+var(--field-text-offset))] pb-[var(--field-padding-y)]",
    label: "text-[length:var(--field-label-size)]",
  },
} as const;

export const FloatingTextarea = React.forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(
  (
    {
      id,
      label,
      error,
      helperText,
      success,
      fieldSize = "default",
      className,
      containerClassName,
      labelClassName,
      required,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId();
    const textareaId = id ?? `floating-textarea-${autoId}`;
    const errorId = error ? `${textareaId}-error` : undefined;
    const helperId = !error && helperText ? `${textareaId}-help` : undefined;
    const describedBy = errorId ?? helperId;

    const stateClasses = error
      ? fieldStateBorders.error
      : success
      ? fieldStateBorders.success
      : fieldStateBorders.default;

    const labelStateClasses = error
      ? labelStates.error
      : success
      ? labelStates.success
      : labelStates.default;

    return (
      <div className={cn("relative w-full min-w-0 ui-field-block", containerClassName)}>
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            fieldBase,
            "resize-y",
            sizeStyles[fieldSize].textarea,
            stateClasses,
            className
          )}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          required={required}
          {...props}
          placeholder=" "
        />
        <label
          htmlFor={textareaId}
          className={cn(
            labelBase,
            "text-right peer-disabled:text-muted-fg",
            sizeStyles[fieldSize].label,
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
);

FloatingTextarea.displayName = "FloatingTextarea";
