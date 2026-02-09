"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currency/symbol";

type Props = {
  baseCurrency: string; // e.g. USD
  quoteCurrency?: string; // default ILS
  rate?: number | null;
  disabled?: boolean;
  onUpdateRate: (nextRate: number) => void;
};

function formatRate3(rate: number | null | undefined): string {
  if (!Number.isFinite(rate as number)) return "";
  return Number(rate).toFixed(3);
}

function parseRate3(input: string): number | null {
  const s = String(input || "").trim();
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Keep at most 3 decimals (avoid float noise)
  return Number(n.toFixed(3));
}

export function FxRateDialog({
  baseCurrency,
  quoteCurrency = "ILS",
  rate,
  disabled = false,
  onUpdateRate,
}: Props) {
  const base = useMemo(() => String(baseCurrency || "").toUpperCase().trim(), [baseCurrency]);
  const quote = useMemo(() => String(quoteCurrency || "").toUpperCase().trim(), [quoteCurrency]);
  const baseLabel = useMemo(() => currencySymbol(base), [base]);
  const quoteLabel = useMemo(() => currencySymbol(quote), [quote]);

  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [rateInput, setRateInput] = useState<string>(formatRate3(rate));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRateInput(formatRate3(rate));
    setError(null);
  }, [open, rate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label="עדכון שער המרה"
      className={cn("h-7 w-7", disabled ? "opacity-60" : "")}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );

  const body = (
    <>
      <div className="flex items-center justify-end gap-2">
        <div className="text-sm whitespace-nowrap">{quoteLabel}</div>
        <Input
          inputMode="decimal"
          value={rateInput}
          onChange={(e) => {
            setRateInput(e.target.value);
            if (error) setError(null);
          }}
          className="w-28 text-right"
          placeholder="3.086"
          style={error ? { borderColor: "var(--field-border-error)" } : undefined}
          aria-invalid={error ? true : undefined}
        />
        <div className="text-sm whitespace-nowrap">= 1 {baseLabel}</div>
      </div>

      {error ? <div className="text-right text-sm text-danger">{error}</div> : null}
    </>
  );

  const footer = (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => {
          const parsed = parseRate3(rateInput);
          if (parsed == null) {
            setError("נא להזין שער תקין עם עד 3 ספרות אחרי הנקודה");
            return;
          }
          onUpdateRate(parsed);
          setOpen(false);
        }}
      >
        עדכון
      </Button>
      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
        סגירה
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="bg-white rounded-t-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="text-right">עדכון שער המרה</SheetTitle>
            <SheetDescription className="text-right">
              אפשר לשנות את שער המטבע לשער שקבעת מול הלקוח.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">{body}</div>
          <SheetFooter className="flex-row">
            {footer}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-right">עדכון שער המרה</DialogTitle>
          <DialogDescription className="text-right">
            אפשר לשנות את שער המטבע לשער שקבעת מול הלקוח.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="sm:justify-start">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

