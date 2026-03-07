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
  labelPlacement?: "floating" | "above";
  labelAlign?: "left" | "right";
  inputAlign?: "left" | "right";
  helperTextAlign?: "left" | "right";
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
      labelPlacement = "floating",
      labelAlign = "right",
      inputAlign,
      helperTextAlign,
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

    return (
      <div
        className={cn(
          "w-full min-w-0",
          labelPlacement === "floating" && "relative ui-field-block",
          containerClassName
        )}
      >
        {labelPlacement === "above" && (
          <label htmlFor={inputId} className={cn("block", labelAlign === "left" ? "text-left" : "text-right", labelClassName)}>
            {label}
            {required && <span className="ms-1">*</span>}
          </label>
        )}
        <input
          ref={(node) => {
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }}
          id={inputId}
          className={cn(
            fieldBase,
            fieldSizes[fieldSize].input,
            stateClasses,
            inputAlign === "left" && "!text-left",
            inputAlign === "right" && "!text-right",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          required={required}
          {...props}
          placeholder={labelPlacement === "above" ? props.placeholder : " "}
        />
        {labelPlacement === "floating" && (
          <label
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
        )}
        {helperText && !error && (
          <p id={helperId} className={cn(helperTextBase, helperTextAlign === "left" && "!text-left", helperTextAlign === "right" && "!text-right")}>
            {helperText}
          </p>
        )}
        {error && (
          <p id={errorId} className={cn(helperTextBase, helperTextError, helperTextAlign === "left" && "!text-left", helperTextAlign === "right" && "!text-right")}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

FloatingInput.displayName = "FloatingInput";
