"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type NewDocOption = {
  label: string;
  href: string;
};

export default function NewDocumentFab() {
  const [open, setOpen] = useState(false);

  const options: NewDocOption[] = useMemo(
    () => [
      {
        label: "קבלה",
        href: "/dashboard/documents/receipt",
      },
    ],
    []
  );

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="מסמך חדש"
        onClick={() => setOpen(true)}
        className="fixed z-40 flex items-center justify-center gap-2 rounded-lg transition-all font-bold bg-[#F39600] hover:bg-[#FFC669] text-[#19183B] text-[18px] py-[14px] shadow-[0_0_13px_0_rgba(0,0,0,0.10)]"
        style={{
          width: 200,
          bottom: 10,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, marginRight: 8, color: "#19183B" }}>+</span>
        <span style={{ color: "#19183B" }}>מסמך חדש</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" dir="rtl" className="rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-right">מסמך חדש</SheetTitle>
          </SheetHeader>

          <div className="p-4 pt-2">
            <div className="space-y-2">
              {options.map((opt) => (
                <Link
                  key={opt.href}
                  href={opt.href}
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-xl border border-border bg-white px-4 py-4 text-right text-[18px] font-medium text-[#19183B] shadow-[0_0_13px_0_rgba(0,0,0,0.06)] hover:bg-[#C6EAE5] transition"
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

