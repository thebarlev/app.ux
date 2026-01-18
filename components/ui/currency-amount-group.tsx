import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CurrencyAmountGroupProps {
  currencyControl: ReactNode;
  amountControl: ReactNode;
  className?: string;
}

/**
 * CurrencyAmountGroup
 *
 * Layout for currency selector + amount input:
 * - Amount: flexible (takes remaining space)
 * - Currency: fixed-ish width (but not forced too small)
 * - Responsive: wraps on small widths without overflow
 */
export function CurrencyAmountGroup({ currencyControl, amountControl, className }: CurrencyAmountGroupProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        "flex items-center gap-3 w-full min-w-0", // בלי flex-wrap
        className
      )}
    >
      {/* Amount: takes remaining space, allowed to shrink */}
      <div className="min-w-0 flex-1">
        {amountControl}
      </div>

      {/* Currency: fixed width */}
      <div className="shrink-0 w-[92px]">
        {currencyControl}
      </div>
    </div>
  );
}

