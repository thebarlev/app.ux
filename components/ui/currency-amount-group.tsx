import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CurrencyAmountGroupProps {
  currencyControl: ReactNode;
  amountControl: ReactNode;
  className?: string;
}

/**
 * CurrencyAmountGroup Component
 * 
 * Ensures consistent layout for currency selector + amount input pairs:
 * - Currency selector: fixed narrow width (72px)
 * - Amount input: flexible width (takes remaining space)
 * - RTL aligned, 12px gap, vertically aligned
 * - Responsive: wraps naturally on mobile if needed
 */
export function CurrencyAmountGroup({
  currencyControl,
  amountControl,
  className,
}: CurrencyAmountGroupProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_72px] gap-3 items-center w-full",
        className
      )}
      dir="rtl"
    >
      {/* Amount input: flexible width, appears first (on right in RTL) */}
      <div className="min-w-0">{amountControl}</div>
      {/* Currency selector: fixed narrow width (72px), appears second (on left in RTL) */}
      <div className="min-w-0">{currencyControl}</div>
    </div>
  );
}
