export const fieldBase =
  "peer w-full bg-[var(--field-bg)] text-[color:var(--field-text)] text-right border-0 border-b appearance-none outline-none transition-colors placeholder:text-transparent focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:text-muted-fg disabled:border-muted-fg";

export const fieldSizes = {
  default: {
    input:
      "h-[var(--field-input-height)] text-[length:var(--field-input-text-size)] px-[var(--field-padding-x)] pt-[var(--field-input-padding-top)] pb-[var(--field-input-padding-bottom)]",
    label: "text-[length:var(--field-label-size)]",
  },
  sm: {
    input:
      "h-[var(--field-height-sm)] text-[length:var(--field-input-text-size)] px-[var(--field-padding-x)] pt-[var(--field-input-padding-top)] pb-[var(--field-input-padding-bottom)]",
    label: "text-[length:var(--field-label-size)]",
  },
} as const;

export const fieldStateBorders = {
  default: "border-[color:var(--field-border)] focus:border-[color:var(--field-border-focus)]",
  error: "border-[color:var(--field-border-error)] focus:border-[color:var(--field-border-error)]",
  success: "border-success focus:border-success",
} as const;

export const labelBase =
  "ui-floating-label absolute start-0 top-[var(--field-label-top)] pointer-events-none text-right text-[length:var(--field-label-size)] leading-[var(--field-label-line-height)] origin-top-right transition-all duration-200 translate-y-0 scale-100 peer-placeholder-shown:top-[var(--field-label-empty-top)] peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-[var(--field-label-top)] peer-focus:translate-y-0 peer-focus:scale-100";

export const labelStates = {
  default: "text-[color:var(--field-label)] peer-focus:text-[color:var(--field-label-focus)]",
  focus: "text-[color:var(--field-label-focus)]",
  error: "text-[color:var(--field-border-error)]",
  success: "text-success",
  disabled: "text-muted-fg",
} as const;

export const helperTextBase = "mt-1 text-[14px] text-muted-fg text-right";
export const helperTextError = "text-danger";

export const selectBase =
  "w-full flex items-center justify-between gap-2 whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:text-muted-fg transition-colors data-[placeholder]:text-placeholder text-right text-[color:var(--field-text)]";

export const selectSizes = {
  default: "h-[var(--field-select-height)]",
  sm: "h-[var(--field-select-height-sm)]",
} as const;

export const selectUnderline =
  "bg-transparent border-0 border-b rounded-none px-[var(--field-padding-x)] pt-[var(--field-select-padding-top)] pb-[var(--field-select-padding-bottom)] items-end focus:outline-none focus:ring-0 translate-y-[var(--field-select-offset-y)]";
