import * as React from "react";
import { cn } from "@/lib/utils";
import {
  fieldBase,
  fieldSizes,
  fieldStateBorders,
  labelBase,
  labelStates,
  helperTextBase,
  helperTextError,
} from "@/components/ui/field-styles";

export interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  helperText?: string;
  success?: boolean;
  fieldSize?: "default" | "sm";
  containerClassName?: string;
  labelClassName?: string;
}

export const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
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
    const inputId = id ?? `floating-input-${autoId}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = !error && helperText ? `${inputId}-help` : undefined;
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

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const labelRef = React.useRef<HTMLLabelElement | null>(null);

    return (
      <div className={cn("relative w-full min-w-0 ui-field-block", containerClassName)}>
        <input
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }}
          id={inputId}
          className={cn(fieldBase, fieldSizes[fieldSize].input, stateClasses, className)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          required={required}
          {...props}
          placeholder=" "
        />
        <label
          ref={labelRef}
          htmlFor={inputId}
          className={cn(
            labelBase,
            "peer-disabled:text-muted-fg",
            fieldSizes[fieldSize].label,
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

FloatingInput.displayName = "FloatingInput";
